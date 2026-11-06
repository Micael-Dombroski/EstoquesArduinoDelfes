-- =============================================================================
-- extras.sql: recursos do PostgreSQL que o Prisma não modela no schema.prisma.
--
-- Como aplicar (a partir de /back):
--   1) npm run migrate -- --name init                      (cria as tabelas)
--   2) npm run migrate -- --create-only --name extras      (cria migração vazia)
--   3) cole o conteúdo deste arquivo no migration.sql gerado em
--      prisma/migrations/<data>_extras/
--   4) npm run migrate                                     (aplica)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Extensões
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- busca por trecho/autocompletar (ILIKE '%x%')

-- -----------------------------------------------------------------------------
-- 2. CHECK constraints: regras de integridade garantidas pelo banco
-- -----------------------------------------------------------------------------
ALTER TABLE produtos
  ADD CONSTRAINT ck_produtos_saldo_nao_negativo   CHECK (saldo_atual >= 0),
  ADD CONSTRAINT ck_produtos_ponto_nao_negativo   CHECK (ponto_reposicao >= 0),
  ADD CONSTRAINT ck_produtos_dias_seguranca       CHECK (dias_seguranca >= 0);

ALTER TABLE produtos_fornecedores
  ADD CONSTRAINT ck_pf_prazo_nao_negativo         CHECK (prazo_entrega_dias >= 0),
  ADD CONSTRAINT ck_pf_preco_nao_negativo         CHECK (preco_unitario IS NULL OR preco_unitario >= 0);

ALTER TABLE fornecedores
  ADD CONSTRAINT ck_fornecedores_valor_minimo     CHECK (valor_minimo_pedido IS NULL OR valor_minimo_pedido >= 0);

ALTER TABLE itens_pedido_entrada
  ADD CONSTRAINT ck_ipe_quantidade_positiva       CHECK (quantidade > 0),
  ADD CONSTRAINT ck_ipe_recebida_nao_negativa     CHECK (quantidade_recebida >= 0);

ALTER TABLE itens_pedido_saida
  ADD CONSTRAINT ck_ips_quantidade_positiva       CHECK (quantidade > 0);

ALTER TABLE movimentacoes
  ADD CONSTRAINT ck_mov_variacao_diferente_zero   CHECK (variacao <> 0),
  -- ENTRADA aumenta, SAIDA diminui; AJUSTE e ESTORNO podem ter qualquer sinal
  ADD CONSTRAINT ck_mov_tipo_sinal CHECK (
        (tipo = 'ENTRADA' AND variacao > 0)
     OR (tipo = 'SAIDA'   AND variacao < 0)
     OR  tipo IN ('AJUSTE', 'ESTORNO')
  ),
  -- uma movimentação não pode vir de item de entrada E de item de saída
  ADD CONSTRAINT ck_mov_origem_unica CHECK (num_nonnulls(item_entrada_id, item_saida_id) <= 1),
  -- ESTORNO deve apontar para a original; as demais não
  ADD CONSTRAINT ck_mov_estorno_referencia CHECK ((tipo = 'ESTORNO') = (estorno_de_id IS NOT NULL));

-- -----------------------------------------------------------------------------
-- 3. Índices que o Prisma não declara (parciais, trigram, BRIN)
-- -----------------------------------------------------------------------------

-- No máximo UM fornecedor preferencial por produto
CREATE UNIQUE INDEX uq_produto_fornecedor_preferencial
  ON produtos_fornecedores (produto_id)
  WHERE preferencial;

-- Busca rápida por nome/código em qualquer posição do texto (autocompletar da saída)
CREATE INDEX idx_produtos_nome_trgm   ON produtos USING gin (nome   gin_trgm_ops);
CREATE INDEX idx_produtos_codigo_trgm ON produtos USING gin (codigo gin_trgm_ops);

-- Semáforo vermelho: indexa só os produtos ativos abaixo do ponto (índice minúsculo)
CREATE INDEX idx_produtos_abaixo_reposicao
  ON produtos (id)
  WHERE ativo AND saldo_atual <= ponto_reposicao;

-- Tabela append-only ordenada no tempo: BRIN ocupa uma fração de um B-tree
CREATE INDEX idx_mov_data_brin ON movimentacoes USING brin (data_movimento);

-- -----------------------------------------------------------------------------
-- 4. Trigger: aplica a variação ao saldo de forma atômica
--    O UPDATE trava a linha do produto, então duas saídas simultâneas
--    são serializadas e o CHECK (saldo_atual >= 0) impede saldo negativo.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_movimentacao_aplica_saldo()
RETURNS trigger AS $$
BEGIN
  UPDATE produtos
     SET saldo_atual   = saldo_atual + NEW.variacao,
         atualizado_em = now()
   WHERE id = NEW.produto_id
  RETURNING saldo_atual INTO NEW.saldo_apos;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto % nao encontrado', NEW.produto_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_movimentacao_aplica_saldo
  BEFORE INSERT ON movimentacoes
  FOR EACH ROW EXECUTE FUNCTION fn_movimentacao_aplica_saldo();

-- Livro-razão imutável: correções são feitas com ESTORNO
CREATE OR REPLACE FUNCTION fn_movimentacao_imutavel()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Movimentacoes sao imutaveis; registre um ESTORNO';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_movimentacao_imutavel
  BEFORE UPDATE OR DELETE ON movimentacoes
  FOR EACH ROW EXECUTE FUNCTION fn_movimentacao_imutavel();

-- -----------------------------------------------------------------------------
-- 5. View: situação do estoque (semáforo, tempo no estoque, itens parados)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_estoque_situacao AS
SELECT
  p.id                AS produto_id,
  p.codigo,
  p.nome,
  p.unidade,
  p.marca,
  p.saldo_atual,
  p.ponto_reposicao,
  CASE
    WHEN p.saldo_atual <= p.ponto_reposicao       THEN 'VERMELHO'
    WHEN p.saldo_atual <= p.ponto_reposicao * 1.5 THEN 'AMARELO'
    ELSE 'VERDE'
  END                 AS semaforo,
  ue.ultima_entrada,
  us.ultima_saida,
  (CURRENT_DATE - ue.ultima_entrada::date) AS dias_no_estoque, -- "tempo no estoque"
  (CURRENT_DATE - us.ultima_saida::date)   AS dias_sem_saida   -- itens parados
FROM produtos p
LEFT JOIN LATERAL (
  SELECT MAX(m.data_movimento) AS ultima_entrada
    FROM movimentacoes m
   WHERE m.produto_id = p.id AND m.tipo = 'ENTRADA'
) ue ON true
LEFT JOIN LATERAL (
  SELECT MAX(m.data_movimento) AS ultima_saida
    FROM movimentacoes m
   WHERE m.produto_id = p.id AND m.tipo = 'SAIDA'
) us ON true
WHERE p.ativo;

-- -----------------------------------------------------------------------------
-- 6. View: sugestão de reposição ("O que comprar hoje")
--
--   consumo_medio_dia = saídas líquidas dos últimos 30 dias / 30
--   ponto_sugerido    = consumo_medio_dia x (prazo de entrega + dias de segurança)
--   precisa_repor     = (saldo + já pedido e não recebido) <= maior entre ponto manual e sugerido
--   qtd_sugerida      = leva o estoque a cobrir (prazo + segurança + 30 dias),
--                       ou 2x o ponto manual se for maior, descontando o que já está a caminho
--   Ajuste a janela (30) e o ciclo de compra (30) conforme a realidade do estoque.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_sugestao_reposicao AS
WITH consumo AS (
  -- Saídas líquidas: SAIDA + estornos de saída (que devolvem ao estoque)
  SELECT m.produto_id, -SUM(m.variacao) AS qtd_30d
    FROM movimentacoes m
    LEFT JOIN movimentacoes o ON o.id = m.estorno_de_id
   WHERE m.data_movimento >= now() - interval '30 days'
     AND (m.tipo = 'SAIDA' OR (m.tipo = 'ESTORNO' AND o.tipo = 'SAIDA'))
   GROUP BY m.produto_id
),
a_caminho AS (
  -- Já pedido e ainda não recebido: evita sugerir compra em duplicidade
  SELECT i.produto_id,
         SUM(GREATEST(i.quantidade - i.quantidade_recebida, 0)) AS qtd_pendente
    FROM itens_pedido_entrada i
    JOIN pedidos_entrada pe ON pe.id = i.pedido_id
   WHERE pe.status IN ('ENVIADO', 'RECEBIDO_PARCIAL')
   GROUP BY i.produto_id
),
base AS (
  SELECT
    p.id AS produto_id, p.codigo, p.nome, p.unidade,
    p.saldo_atual, p.ponto_reposicao, p.dias_seguranca,
    COALESCE(c.qtd_30d, 0) / 30.0        AS consumo_medio_dia,
    COALESCE(a.qtd_pendente, 0)          AS qtd_pendente,
    f.fornecedor_id, f.prazo_entrega_dias, f.preco_unitario
  FROM produtos p
  LEFT JOIN consumo   c ON c.produto_id = p.id
  LEFT JOIN a_caminho a ON a.produto_id = p.id
  -- fornecedor preferencial; se não houver, o de menor prazo
  LEFT JOIN LATERAL (
    SELECT pf.fornecedor_id, pf.prazo_entrega_dias, pf.preco_unitario
      FROM produtos_fornecedores pf
      JOIN fornecedores fo ON fo.id = pf.fornecedor_id AND fo.ativo
     WHERE pf.produto_id = p.id
     ORDER BY pf.preferencial DESC, pf.prazo_entrega_dias ASC
     LIMIT 1
  ) f ON true
  WHERE p.ativo
),
calc AS (
  SELECT b.*,
         CEIL(b.consumo_medio_dia * (COALESCE(b.prazo_entrega_dias, 0) + b.dias_seguranca)) AS ponto_sugerido,
         b.saldo_atual + b.qtd_pendente AS disponivel
    FROM base b
)
SELECT
  c.produto_id, c.codigo, c.nome, c.unidade,
  c.saldo_atual, c.qtd_pendente, c.ponto_reposicao, c.ponto_sugerido,
  ROUND(c.consumo_medio_dia, 3) AS consumo_medio_dia,
  CASE WHEN c.consumo_medio_dia > 0
       THEN ROUND(c.saldo_atual / c.consumo_medio_dia, 1) END AS dias_restantes,
  c.fornecedor_id, fo.nome AS fornecedor_nome,
  c.prazo_entrega_dias, c.preco_unitario,
  (c.disponivel <= GREATEST(c.ponto_reposicao, c.ponto_sugerido)
     AND (c.consumo_medio_dia > 0 OR c.ponto_reposicao > 0)) AS precisa_repor,
  CEIL(GREATEST(
        GREATEST(
          c.consumo_medio_dia * (COALESCE(c.prazo_entrega_dias, 0) + c.dias_seguranca + 30),
          c.ponto_reposicao * 2
        ) - c.disponivel,
        0)) AS qtd_sugerida
FROM calc c
LEFT JOIN fornecedores fo ON fo.id = c.fornecedor_id;

-- Uso: tela "O que comprar hoje", agrupada por fornecedor
--   SELECT * FROM vw_sugestao_reposicao
--    WHERE precisa_repor
--    ORDER BY fornecedor_nome, dias_restantes NULLS LAST;

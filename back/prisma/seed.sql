-- =============================================================================
-- seed.sql: dados de demonstração do sistema de estoque
--
-- ATENÇÃO: apaga TODOS os dados das tabelas antes de popular. Use só em
-- ambiente de desenvolvimento/demonstração.
--
-- Pré-requisito: migrações aplicadas, incluindo:
--   * "extras" (trigger de saldo, CHECKs e views)
--   * "acompanhamento_entradas" (status APROVADO/RECUSADO e coluna solicitante_id)
-- O próprio script confere isso e para com uma mensagem clara.
--
-- Como rodar (na RAIZ do projeto, com o banco no ar):
--   CMD:
--     docker compose exec -T db psql -U estoque -d estoque_db -v ON_ERROR_STOP=1 < back\prisma\seed.sql
--   Linux/macOS:
--     docker compose exec -T db psql -U estoque -d estoque_db -v ON_ERROR_STOP=1 < back/prisma/seed.sql
--   (troque usuário e banco pelos valores do seu .env, se forem diferentes)
--
-- O que gera:
--   25 produtos (componentes de eletrônica/Arduino), 4 fornecedores, 6 requisitantes,
--   carga inicial de estoque, ~30 dias de retiradas (só dias úteis), 2 retiradas
--   desfeitas (estorno) e 12 pedidos de compra em todos os status da tela
--   "Acompanhar pedidos" (pendente, aprovado, recusado, a caminho, recebido e cancelado),
--   com solicitante, um deles atrasado e um sem previsão de entrega.
--   Os saldos finais são planejados: ~6 produtos em vermelho, ~4 em amarelo,
--   1 item parado, e a tela "O que comprar hoje" sugere ~4 produtos em 3 fornecedores.
--   O consumo varia a cada execução do seed apenas pela semente fixa (resultado repetível).
-- =============================================================================

\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_movimentacao_aplica_saldo') THEN
    RAISE EXCEPTION 'Aplique a migracao "extras" antes do seed (trigger de saldo nao encontrada).';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'pedidos_entrada' AND column_name = 'solicitante_id')
     OR NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                     WHERE t.typname = 'status_pedido_entrada' AND e.enumlabel = 'APROVADO') THEN
    RAISE EXCEPTION 'Aplique a migracao "acompanhamento_entradas" antes do seed (coluna solicitante_id e status APROVADO/RECUSADO nao encontrados).';
  END IF;
END $$;

BEGIN;

SELECT setseed(0.42);  -- consumo "aleatório", porém repetível

TRUNCATE movimentacoes, itens_pedido_saida, pedidos_saida, itens_pedido_entrada,
         pedidos_entrada, produtos_fornecedores, produtos, fornecedores, requisitantes
RESTART IDENTITY CASCADE;

-- -----------------------------------------------------------------------------
-- 1. Cadastros
-- -----------------------------------------------------------------------------
INSERT INTO requisitantes (id, nome, setor) VALUES
  (1, 'Ana Beatriz Lima',      'Laboratório de Eletrônica'),
  (2, 'Carlos Eduardo Rocha',  'Laboratório de Eletrônica'),
  (3, 'Fernanda Alves',        'Projetos de Robótica'),
  (4, 'João Pedro Martins',    'Projetos de Robótica'),
  (5, 'Mariana Costa',         'Manutenção'),
  (6, 'Ricardo Nunes',         'Manutenção');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'perfil_usuario') THEN
    CREATE TYPE "perfil_usuario" AS ENUM ('SOLICITANTE', 'ALMOXARIFADO', 'COMPRAS', 'SUPERVISOR');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  senha_hash VARCHAR(255) NOT NULL,
  perfil perfil_usuario NOT NULL,
  requisitante_id INTEGER REFERENCES requisitantes(id) ON DELETE SET NULL ON UPDATE CASCADE,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

TRUNCATE usuarios RESTART IDENTITY CASCADE;

-- Senha padrão de demonstração para todos: 123456 (SHA-256)
INSERT INTO usuarios (id, nome, email, senha_hash, perfil, requisitante_id) VALUES
  (1, 'Ana Beatriz Lima',     'solicitante@estoque.local',  '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', 'SOLICITANTE',  1),
  (2, 'Carlos Eduardo Rocha', 'almoxarifado@estoque.local', '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', 'ALMOXARIFADO', 2),
  (3, 'Paula Ribeiro',        'compras@estoque.local',      '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', 'COMPRAS',      NULL),
  (4, 'Roberto Nunes',        'supervisor@estoque.local',   '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', 'SUPERVISOR',   6);

-- CNPJs fictícios, mas com dígitos verificadores válidos (passam na validação do cadastro de fornecedor).
INSERT INTO fornecedores (id, nome, cnpj, contato, email, telefone, valor_minimo_pedido, atualizado_em) VALUES
  (1, 'Distribuidora Catarinense de Eletrônicos', '12.345.678/0001-95', 'Marcos Teixeira', 'vendas@dce.example.com',               '(49) 3222-1000', 400.00, now()),
  (2, 'Casa dos Componentes',                     '23.456.789/0001-95', 'Paula Ribeiro',   'contato@casadoscomponentes.example.com', '(11) 4000-2000', 250.00, now()),
  (3, 'Maker Brasil Atacado',                     '34.567.890/0001-30', 'Rafael Souza',    'atacado@makerbrasil.example.com',        '(41) 3030-4000', 600.00, now()),
  (4, 'Planalto Ferramentas e EPI',               '45.678.901/0001-75', 'Joana Meireles',  'pedidos@planalto.example.com',           '(49) 3251-5000', 150.00, now());

-- Definição dos produtos e do comportamento planejado
--   taxa        = retirada média por dia (0 = item parado)
--   qtd_tipica  = quantidade típica por retirada
--   saldo_final = saldo desejado hoje (a carga inicial é calculada para chegar nele)
--   forn1/2     = fornecedor preferencial e alternativo, com prazo (dias) e preço
CREATE TEMP TABLE tmp_prod (
  id int, codigo text, nome text, unidade text, marca text,
  ponto numeric, seg int, taxa numeric, qtd_tipica numeric, saldo_final numeric,
  forn1 int, prazo1 int, preco1 numeric,
  forn2 int, prazo2 int, preco2 numeric
);

INSERT INTO tmp_prod VALUES
  ( 1,'ARD-UNO',   'Placa Arduino Uno R3',                    'un','Genérica',   8,5, 0.5, 1, 12, 3,10,58.00, 2, 7,62.50),
  ( 2,'ARD-NANO',  'Placa Arduino Nano',                      'un','Genérica',   6,5, 0.4, 1, 20, 3,10,32.00, 2, 7,35.00),
  ( 3,'ESP32-DEV', 'Módulo ESP32 DevKit',                     'un','Genérica',   5,5,0.35, 1,  3, 3,10,42.00, 2, 7,46.00),
  ( 4,'SEN-DHT22', 'Sensor de temperatura e umidade DHT22',   'un','Genérica',   6,5, 0.3, 1, 14, 3,10,19.90, 2, 7,22.00),
  ( 5,'SEN-HCSR04','Sensor ultrassônico HC-SR04',             'un','Genérica',   8,5, 0.5, 1,  9, 3,10, 6.50, 2, 7, 7.20),
  ( 6,'SEN-LDR',   'Sensor de luminosidade LDR 5 mm',         'un','Genérica',  10,5, 0.4, 2, 30, 2, 7, 1.20, 1, 3, 1.40),
  ( 7,'RES-220R',  'Resistor 220 ohms 1/4 W',                 'un','Genérica', 200,7,  12,20,350, 1, 3, 0.08, 2, 7, 0.07),
  ( 8,'RES-10K',   'Resistor 10 kohms 1/4 W',                 'un','Genérica', 200,7,  10,20, 90, 1, 3, 0.08, 2, 7, 0.07),
  ( 9,'CAP-100NF', 'Capacitor cerâmico 100 nF',               'un','Genérica', 100,7,   6,10,180, 1, 3, 0.15, 2, 7, 0.14),
  (10,'CAP-1000UF','Capacitor eletrolítico 1000 uF 25 V',     'un','Genérica',  30,7, 1.2, 3, 40, 1, 3, 1.90, 2, 7, 1.70),
  (11,'LED-5-VM',  'LED difuso 5 mm vermelho',                'un','Genérica', 150,7,   9,15,400, 1, 3, 0.20, NULL,NULL,NULL),
  (12,'LED-5-VD',  'LED difuso 5 mm verde',                   'un','Genérica', 150,7,   7,15,120, 1, 3, 0.22, 2, 7, 0.20),
  (13,'TRA-BC547', 'Transistor BC547',                        'un','Genérica',  60,7,   3, 5,200, 1, 3, 0.30, NULL,NULL,NULL),
  (14,'REG-7805',  'Regulador de tensão 7805',                'un','Genérica',  20,7,   1, 2, 55, 1, 3, 1.10, 2, 7, 1.20),
  (15,'PRO-830',   'Protoboard 830 pontos',                   'un','Genérica',  10,5, 0.8, 2, 35, 3,10,14.90, 2, 7,16.00),
  (16,'JMP-MM-40', 'Jumpers macho-macho 20 cm (kit 40)',      'un','Genérica',  12,5, 1.0, 2, 16, 3,10, 9.50, 2, 7,10.50),
  (17,'JMP-MF-40', 'Jumpers macho-fêmea 20 cm (kit 40)',      'un','Genérica',  12,5, 0.8, 2, 40, 3,10, 9.50, 2, 7,10.50),
  (18,'CAB-USB-AB','Cabo USB A-B 1 m',                        'un','Genérica',  10,5, 0.6, 2, 22, 2, 7, 8.50, 3,10, 8.00),
  (19,'FIO-22AWG', 'Fio rígido 22 AWG',                       'm', 'Genérica', 100,5,   6,10,260, 2, 7, 0.90, NULL,NULL,NULL),
  (20,'SOL-SN60',  'Solda de estanho 60/40 (rolo 100 g)',     'un','Genérica',   6,5, 0.3, 1,  2, 4, 2,38.00, 1, 3,41.00),
  (21,'SOL-FLX50', 'Fluxo de solda 50 g',                     'un','Genérica',   4,5,0.15, 1,  7, 4, 2,12.00, NULL,NULL,NULL),
  (22,'EPI-OCULOS','Óculos de proteção incolor',              'un','Genérica',   5,5, 0.1, 1, 14, 4, 2, 9.50, NULL,NULL,NULL),
  (23,'FIT-ISO19', 'Fita isolante 19 mm',                     'un','Genérica',   8,5, 0.5, 1,  5, 4, 2, 4.20, NULL,NULL,NULL),
  (24,'MUL-DIG',   'Multímetro digital',                      'un','Genérica',   2,5,   0, 1,  6, 4, 2,89.00, 2, 7,95.00),
  (25,'FON-9V1A',  'Fonte chaveada 9 V 1 A',                  'un','Genérica',   6,5, 0.4, 1,  4, 3,10,18.00, 2, 7,21.00);

INSERT INTO produtos (id, codigo, nome, unidade, marca, ponto_reposicao, dias_seguranca, atualizado_em)
SELECT id, codigo, nome, unidade, marca, ponto, seg, now() FROM tmp_prod;

INSERT INTO produtos_fornecedores (produto_id, fornecedor_id, prazo_entrega_dias, preco_unitario, preferencial)
SELECT id, forn1, prazo1, preco1, true  FROM tmp_prod
UNION ALL
SELECT id, forn2, prazo2, preco2, false FROM tmp_prod WHERE forn2 IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. Planejamento das retiradas dos últimos 30 dias (só dias úteis)
-- -----------------------------------------------------------------------------
-- Cada produto sai em alguns dias; "slot" agrupa itens do mesmo dia em retiradas
-- (manhã, fim da manhã, tarde), formando pedidos com 1 a vários itens.
CREATE TEMP TABLE tmp_itens AS
SELECT d.dia,
       floor(random() * 3)::int AS slot,
       p.id AS produto_id,
       GREATEST(1, round(p.qtd_tipica * (0.6 + 0.8 * random())))::numeric AS qtd
  FROM tmp_prod p
 CROSS JOIN generate_series(0, 29) AS d(dia)
 WHERE extract(isodow FROM current_date - d.dia) < 6
   AND p.taxa > 0
   AND random() < LEAST(1.0, p.taxa / p.qtd_tipica * 1.4);

CREATE TEMP TABLE tmp_pedidos AS
SELECT row_number() OVER (ORDER BY dia DESC, slot) AS id,
       dia, slot,
       LEAST(
         ((current_date - dia)::timestamp
            + CASE slot WHEN 0 THEN time '08:40' WHEN 1 THEN time '11:15' ELSE time '15:20' END)::timestamptz,
         now() - interval '5 minutes'
       ) AS ts,
       1 + floor(random() * 6)::int AS requisitante_id
  FROM (SELECT DISTINCT dia, slot FROM tmp_itens) x;

CREATE TEMP TABLE tmp_saida AS
SELECT row_number() OVER (ORDER BY pe.ts, i.produto_id) AS item_id,
       pe.id AS pedido_id, i.produto_id, i.qtd, pe.ts, pe.requisitante_id
  FROM tmp_itens i
  JOIN tmp_pedidos pe ON pe.dia = i.dia AND pe.slot = i.slot;

-- -----------------------------------------------------------------------------
-- 3. Carga inicial de estoque (pedidos de entrada já recebidos, há ~35 dias)
--    Quantidade = tudo que será retirado + saldo final planejado.
-- -----------------------------------------------------------------------------
INSERT INTO pedidos_entrada (id, fornecedor_id, solicitante_id, status, data_pedido, previsao_entrega, data_recebimento, observacao, atualizado_em)
SELECT f.id, f.id, CASE f.id WHEN 1 THEN 1 WHEN 2 THEN 2 WHEN 3 THEN 1 ELSE 2 END,
       'RECEBIDO'::status_pedido_entrada,
       now() - interval '38 days', current_date - 35, now() - interval '35 days',
       'Carga inicial de estoque', now()
  FROM fornecedores f;

INSERT INTO itens_pedido_entrada (id, pedido_id, produto_id, quantidade, quantidade_recebida, marca, preco_unitario)
SELECT p.id, p.forn1, p.id,
       GREATEST(COALESCE(c.total, 0) + p.saldo_final, 1),
       GREATEST(COALESCE(c.total, 0) + p.saldo_final, 1),
       p.marca, p.preco1
  FROM tmp_prod p
  LEFT JOIN (SELECT produto_id, SUM(qtd) AS total FROM tmp_saida GROUP BY produto_id) c
         ON c.produto_id = p.id;

-- O trigger atualiza produtos.saldo_atual e preenche saldo_apos
INSERT INTO movimentacoes (produto_id, tipo, variacao, data_movimento, observacao, item_entrada_id)
SELECT i.produto_id, 'ENTRADA'::tipo_movimentacao, i.quantidade, pe.data_recebimento,
       'Carga inicial de estoque', i.id
  FROM itens_pedido_entrada i
  JOIN pedidos_entrada pe ON pe.id = i.pedido_id
 ORDER BY i.id;

-- -----------------------------------------------------------------------------
-- 4. Retiradas (pedidos de saída, itens e movimentações, em ordem cronológica)
-- -----------------------------------------------------------------------------
INSERT INTO pedidos_saida (id, requisitante_id, status, data_pedido)
SELECT id, requisitante_id, 'CONCLUIDO'::status_pedido_saida, ts
  FROM tmp_pedidos
 ORDER BY id;

INSERT INTO itens_pedido_saida (id, pedido_id, produto_id, quantidade)
SELECT item_id, pedido_id, produto_id, qtd FROM tmp_saida ORDER BY item_id;

INSERT INTO movimentacoes (produto_id, tipo, variacao, data_movimento, item_saida_id)
SELECT produto_id, 'SAIDA'::tipo_movimentacao, -qtd, ts, item_id
  FROM tmp_saida
 ORDER BY ts, item_id;

-- Duas retiradas recentes desfeitas: pedido CANCELADO + movimentação de ESTORNO
CREATE TEMP TABLE tmp_cancel AS
SELECT id FROM pedidos_saida ORDER BY data_pedido DESC, id DESC LIMIT 2;

UPDATE pedidos_saida
   SET status = 'CANCELADO'::status_pedido_saida,
       observacao = 'Retirada lançada por engano'
 WHERE id IN (SELECT id FROM tmp_cancel);

INSERT INTO movimentacoes (produto_id, tipo, variacao, data_movimento, observacao, estorno_de_id)
SELECT m.produto_id, 'ESTORNO'::tipo_movimentacao, -m.variacao,
       LEAST(m.data_movimento + interval '10 minutes', now()),
       'Retirada desfeita', m.id
  FROM movimentacoes m
  JOIN itens_pedido_saida i ON i.id = m.item_saida_id
 WHERE i.pedido_id IN (SELECT id FROM tmp_cancel);

-- -----------------------------------------------------------------------------
-- 5. Pedidos de compra em andamento (tela "Acompanhar pedidos")
--    Mapa de status: Pendente = RASCUNHO; Aprovado = APROVADO; Recusado = RECUSADO;
--    A caminho = ENVIADO ou RECEBIDO_PARCIAL; Recebido = RECEBIDO (pedidos 1 a 4, acima).
--    Só os ENVIADOS entram no "já a caminho" da reposição. Nenhum destes gera movimentação.
-- -----------------------------------------------------------------------------
INSERT INTO pedidos_entrada (id, fornecedor_id, solicitante_id, status, data_pedido, previsao_entrega, data_recebimento, observacao, atualizado_em) VALUES
  ( 5, 3, 3, 'ENVIADO'::status_pedido_entrada,   now() - interval '3 days',  current_date + 5,  NULL, 'Reposição de placas e sensores', now()),
  ( 6, 4, 5, 'ENVIADO'::status_pedido_entrada,   now() - interval '1 day',   current_date + 1,  NULL, NULL, now()),
  ( 7, 2, 1, 'RASCUNHO'::status_pedido_entrada,  now(),                      NULL,              NULL, 'Rascunho gerado pela reposição', now()),
  ( 8, 1, 2, 'RASCUNHO'::status_pedido_entrada,  now() - interval '1 day',   current_date + 6,  NULL, 'Aguardando aprovação do responsável', now()),
  ( 9, 4, 5, 'RASCUNHO'::status_pedido_entrada,  now() - interval '2 hours', NULL,              NULL, NULL, now()),
  (10, 3, 3, 'APROVADO'::status_pedido_entrada,  now() - interval '2 days',  current_date + 9,  NULL, 'Aprovado, falta enviar ao fornecedor', now()),
  (11, 2, 4, 'APROVADO'::status_pedido_entrada,  now() - interval '1 day',   current_date + 4,  NULL, NULL, now()),
  (12, 3, 4, 'RECUSADO'::status_pedido_entrada,  now() - interval '6 days',  NULL,              NULL, 'Recusado: valor acima do orçamento do mês', now()),
  (13, 1, 6, 'RECUSADO'::status_pedido_entrada,  now() - interval '12 days', NULL,              NULL, 'Recusado: já há estoque suficiente', now()),
  (14, 1, 2, 'ENVIADO'::status_pedido_entrada,   now() - interval '4 days',  current_date + 2,  NULL, NULL, now()),
  (15, 2, 1, 'ENVIADO'::status_pedido_entrada,   now() - interval '9 days',  current_date - 2,  NULL, 'Fornecedor informou atraso na transportadora', now()),
  (16, 4, 5, 'CANCELADO'::status_pedido_entrada, now() - interval '15 days', NULL,              NULL, 'Pedido duplicado', now());

INSERT INTO itens_pedido_entrada (id, pedido_id, produto_id, quantidade, quantidade_recebida, marca, preco_unitario) VALUES
  (100,  5,  3,  20, 0, 'Genérica', 42.00),
  (101,  5,  5,  15, 0, 'Genérica',  6.50),
  (102,  6, 23,  24, 0, 'Genérica',  4.20),
  (103,  7, 10,  30, 0, NULL,        1.70),
  (104,  7, 16,  20, 0, NULL,       10.50),
  (200,  8,  8, 300, 0, 'Genérica',  0.08),
  (201,  8, 12, 200, 0, 'Genérica',  0.22),
  (202,  9, 20,  20, 0, 'Genérica', 38.00),
  (203, 10, 25,  10, 0, 'Genérica', 18.00),
  (204, 10,  2,  10, 0, 'Genérica', 32.00),
  (205, 11, 19, 200, 0, 'Genérica',  0.90),
  (206, 11, 18,  10, 0, 'Genérica',  8.50),
  (207, 12, 15,  50, 0, 'Genérica', 14.90),
  (208, 13,  9, 500, 0, 'Genérica',  0.15),
  (209, 14,  7, 500, 0, 'Genérica',  0.08),
  (210, 14, 11, 300, 0, 'Genérica',  0.20),
  (211, 15,  6, 100, 0, 'Genérica',  1.20),
  (212, 16, 22,  10, 0, 'Genérica',  9.50);

ALTER TABLE pedidos_entrada ADD COLUMN IF NOT EXISTS numero_oc VARCHAR(40);
UPDATE pedidos_entrada
   SET numero_oc = 'OC-' || LPAD(id::text, 4, '0')
 WHERE status IN ('ENVIADO', 'RECEBIDO_PARCIAL', 'RECEBIDO');

-- -----------------------------------------------------------------------------
-- 6. Ajusta as sequências (os ids acima foram inseridos explicitamente)
-- -----------------------------------------------------------------------------
SELECT setval(pg_get_serial_sequence('requisitantes',         'id'), (SELECT max(id) FROM requisitantes));
SELECT setval(pg_get_serial_sequence('usuarios',              'id'), (SELECT max(id) FROM usuarios));
SELECT setval(pg_get_serial_sequence('fornecedores',          'id'), (SELECT max(id) FROM fornecedores));
SELECT setval(pg_get_serial_sequence('produtos',              'id'), (SELECT max(id) FROM produtos));
SELECT setval(pg_get_serial_sequence('pedidos_entrada',       'id'), (SELECT max(id) FROM pedidos_entrada));
SELECT setval(pg_get_serial_sequence('itens_pedido_entrada',  'id'), (SELECT max(id) FROM itens_pedido_entrada));
SELECT setval(pg_get_serial_sequence('pedidos_saida',         'id'), (SELECT max(id) FROM pedidos_saida));
SELECT setval(pg_get_serial_sequence('itens_pedido_saida',    'id'), (SELECT max(id) FROM itens_pedido_saida));

COMMIT;

-- -----------------------------------------------------------------------------
-- 7. Conferência
-- -----------------------------------------------------------------------------
SELECT 'produtos' AS tabela, count(*) FROM produtos
UNION ALL SELECT 'fornecedores',     count(*) FROM fornecedores
UNION ALL SELECT 'requisitantes',    count(*) FROM requisitantes
UNION ALL SELECT 'pedidos_entrada',  count(*) FROM pedidos_entrada
UNION ALL SELECT 'pedidos_saida',    count(*) FROM pedidos_saida
UNION ALL SELECT 'movimentacoes',    count(*) FROM movimentacoes;

SELECT status, count(*) AS pedidos_de_compra FROM pedidos_entrada GROUP BY status ORDER BY status;

-- Estas duas consultas dependem das views da migração "extras"
SELECT semaforo, count(*) FROM vw_estoque_situacao GROUP BY semaforo ORDER BY semaforo;

SELECT nome, fornecedor_nome, dias_restantes, qtd_sugerida
  FROM vw_sugestao_reposicao
 WHERE precisa_repor
 ORDER BY fornecedor_nome, dias_restantes NULLS LAST;

##Prompts Usados

-Foi repassado a IA por meio de imagem os possíveis relacionamentos entre as entidades mapeadas no projeto,
 apresentado o modelo do trabalho e encaminhado o seguinte promt:
 "Atue como um Engenheiro de Software Sênior e expert em user experience.
Qual sua opinião? o sistema usado no estoque é o symprod, fiz um levantamento de entidades que devem ter no sistema e anexei um trabalho com requisitos? acha que fica bom usar isso? qual diferencial você colocaria no projeto que pode auxiliar no dia a dia usando esse projeto?"

Resposta do Agente: A resposta da IA foi salva em um arquivo em anexo e será usada na tomada de decisões para o projeto.

-Foi solicitado a montagem do schema do banco baseada nas classes, atributos e relacionamentos idealizados:
"Você é um expert em prisma e banco de dados postgres, monte os schemas para as tabelas do projeto, tendo em vista os relacionamentos e
especificacões idealizadas anteriormente, também use o conhecimento em postgres a seu favor para otimizar o banco pensando até em consultas
 inteligentes e indices se necessário."

 Resposta do Agente: "Montei dois arquivos: o schema.prisma, com as 9 tabelas, e o extras.sql, com o que o Prisma não consegue expressar (constraints, índices especiais, triggers e views). Não rodei nada contra um banco, então rode as migrações e confira se aplicam sem erro.

Modelo

Produto, Fornecedor, ProdutoFornecedor (N:N com prazo, preço e flag de preferencial), Requisitante, PedidoEntrada e PedidoSaida (cada um com seus itens) e Movimentacao.

Decisões de banco
Movimentacao é a fonte da verdade. Cada linha tem uma variação assinada (entrada positiva, saída negativa) e um saldoApos para auditoria. Ela é imutável por trigger, e erros são corrigidos com um registro ESTORNO apontando para a movimentação original.
Produto.saldoAtual é um cache atualizado por trigger no INSERT da movimentação. O UPDATE trava a linha do produto, então duas saídas simultâneas são serializadas. O CHECK (saldo_atual >= 0) impede saldo negativo sem depender do código da aplicação.
Constraints no banco: quantidades positivas, prazo não negativo e sinal coerente com o tipo (ENTRADA > 0, SAIDA < 0). Se a API tiver bug, o banco ainda barra.
Índices, cada um com um motivo:
(produto_id, tipo, data_movimento DESC) atende consumo médio, última entrada e última saída.
Um índice único parcial garante no máximo um fornecedor preferencial por produto.
GIN com pg_trgm acelera o autocompletar da tela de saída.
Um índice parcial cobre só os produtos abaixo do ponto, para o semáforo vermelho.
BRIN em data_movimento, por ser uma tabela append-only.
Duas views entregam o diferencial:
vw_estoque_situacao traz semáforo, tempo no estoque e dias sem saída.
vw_sugestao_reposicao é a tela “O que comprar hoje”. Calcula consumo médio dos últimos 30 dias, ponto sugerido (consumo × (prazo + segurança)), desconta o que já está pedido e não recebido, e escolhe o fornecedor preferencial (ou o de menor prazo).
Como aplicar
bash
cd back
npm run migrate -- --name init
npm run migrate -- --create-only --name extras

Cole o conteúdo de extras.sql no migration.sql gerado em prisma/migrations/<data>_extras/ e rode npm run migrate de novo.

Pontos de atenção
A aplicação nunca deve escrever em saldoAtual nem saldoApos. Só insira movimentações. Uma saída fica assim:
js
   await prisma.$transaction(async (tx) => {
     const pedido = await tx.pedidoSaida.create({
       data: { requisitanteId, itens: { create: itens } },
       include: { itens: true },
     });
     for (const item of pedido.itens) {
       await tx.movimentacao.create({
         data: {
           produtoId: item.produtoId,
           tipo: "SAIDA",
           variacao: item.quantidade.neg(),
           itemSaidaId: item.id,
         },
       });
     }
   });

Se o saldo for insuficiente, o erro virá do CHECK (mensagem com ck_produtos_saldo_nao_negativo). Capture-o e devolva um 409 com mensagem clara.
2. O Prisma pode tentar apagar os índices que ele não modela (parciais, trigram, BRIN) em migrações futuras. Sempre use --create-only e revise o migration.sql antes de aplicar, removendo qualquer DROP INDEX indevido.
3. As views não aparecem no Prisma Client. Consulte com prisma.$queryRaw. Se alterar o tipo de uma coluna usada por uma view, será preciso recriá-la.
4. Decimal volta como objeto (Prisma.Decimal), não como number. Converta com .toNumber() ou .toString() antes de serializar no JSON.
5. Prisma 7: se o seu prisma init gerou um prisma.config.ts, a url do datasource sai do schema e vai para esse arquivo, e o generator muda para prisma-client. Confira a versão com npx prisma -v.

Escolhas que podem mudar
Não incluí Usuario. Se quiser registrar quem fez cada movimentação, é uma tabela a mais e uma FK em Movimentacao. Hoje o requisitante cobre o lado da saída.
A janela de 30 dias e o ciclo de compra de 30 dias estão fixos na view. Se o estoque tiver giro muito diferente, ajuste esses números.
Se existirem vários almoxarifados, o saldo precisaria ser por local (nova entidade e local_id em Movimentacao). Você ainda não respondeu se o estoque é de um local só.

Para o DOCUMENTACAO_IA.md, vale registrar a decisão “saldo por trigger + movimentação imutável” como Decisão de Engenharia (consistência e auditoria)."
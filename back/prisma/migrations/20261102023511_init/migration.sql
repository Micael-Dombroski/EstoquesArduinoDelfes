-- CreateEnum
CREATE TYPE "status_pedido_entrada" AS ENUM ('RASCUNHO', 'ENVIADO', 'RECEBIDO_PARCIAL', 'RECEBIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "status_pedido_saida" AS ENUM ('CONCLUIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "tipo_movimentacao" AS ENUM ('ENTRADA', 'SAIDA', 'AJUSTE', 'ESTORNO');

-- CreateTable
CREATE TABLE "produtos" (
    "id" SERIAL NOT NULL,
    "codigo" VARCHAR(40) NOT NULL,
    "nome" VARCHAR(150) NOT NULL,
    "descricao" TEXT,
    "unidade" VARCHAR(10) NOT NULL,
    "marca" VARCHAR(80),
    "saldo_atual" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "ponto_reposicao" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "dias_seguranca" INTEGER NOT NULL DEFAULT 3,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "produtos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fornecedores" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(150) NOT NULL,
    "cnpj" VARCHAR(18),
    "contato" VARCHAR(100),
    "email" VARCHAR(150),
    "telefone" VARCHAR(30),
    "valor_minimo_pedido" DECIMAL(12,2),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fornecedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produtos_fornecedores" (
    "produto_id" INTEGER NOT NULL,
    "fornecedor_id" INTEGER NOT NULL,
    "prazo_entrega_dias" INTEGER NOT NULL,
    "preco_unitario" DECIMAL(12,2),
    "preferencial" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "produtos_fornecedores_pkey" PRIMARY KEY ("produto_id","fornecedor_id")
);

-- CreateTable
CREATE TABLE "requisitantes" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "setor" VARCHAR(80),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requisitantes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedidos_entrada" (
    "id" SERIAL NOT NULL,
    "fornecedor_id" INTEGER NOT NULL,
    "status" "status_pedido_entrada" NOT NULL DEFAULT 'RASCUNHO',
    "data_pedido" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previsao_entrega" DATE,
    "data_recebimento" TIMESTAMPTZ(6),
    "observacao" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pedidos_entrada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens_pedido_entrada" (
    "id" SERIAL NOT NULL,
    "pedido_id" INTEGER NOT NULL,
    "produto_id" INTEGER NOT NULL,
    "quantidade" DECIMAL(12,3) NOT NULL,
    "quantidade_recebida" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "marca" VARCHAR(80),
    "preco_unitario" DECIMAL(12,2),

    CONSTRAINT "itens_pedido_entrada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedidos_saida" (
    "id" SERIAL NOT NULL,
    "requisitante_id" INTEGER NOT NULL,
    "status" "status_pedido_saida" NOT NULL DEFAULT 'CONCLUIDO',
    "data_pedido" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observacao" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pedidos_saida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens_pedido_saida" (
    "id" SERIAL NOT NULL,
    "pedido_id" INTEGER NOT NULL,
    "produto_id" INTEGER NOT NULL,
    "quantidade" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "itens_pedido_saida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimentacoes" (
    "id" SERIAL NOT NULL,
    "produto_id" INTEGER NOT NULL,
    "tipo" "tipo_movimentacao" NOT NULL,
    "variacao" DECIMAL(12,3) NOT NULL,
    "saldo_apos" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "data_movimento" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observacao" TEXT,
    "item_entrada_id" INTEGER,
    "item_saida_id" INTEGER,
    "estorno_de_id" INTEGER,

    CONSTRAINT "movimentacoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "produtos_codigo_key" ON "produtos"("codigo");

-- CreateIndex
CREATE INDEX "produtos_ativo_nome_idx" ON "produtos"("ativo", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "fornecedores_cnpj_key" ON "fornecedores"("cnpj");

-- CreateIndex
CREATE INDEX "fornecedores_ativo_nome_idx" ON "fornecedores"("ativo", "nome");

-- CreateIndex
CREATE INDEX "produtos_fornecedores_fornecedor_id_idx" ON "produtos_fornecedores"("fornecedor_id");

-- CreateIndex
CREATE INDEX "requisitantes_ativo_nome_idx" ON "requisitantes"("ativo", "nome");

-- CreateIndex
CREATE INDEX "pedidos_entrada_status_data_pedido_idx" ON "pedidos_entrada"("status", "data_pedido" DESC);

-- CreateIndex
CREATE INDEX "pedidos_entrada_fornecedor_id_data_pedido_idx" ON "pedidos_entrada"("fornecedor_id", "data_pedido" DESC);

-- CreateIndex
CREATE INDEX "itens_pedido_entrada_produto_id_idx" ON "itens_pedido_entrada"("produto_id");

-- CreateIndex
CREATE UNIQUE INDEX "itens_pedido_entrada_pedido_id_produto_id_key" ON "itens_pedido_entrada"("pedido_id", "produto_id");

-- CreateIndex
CREATE INDEX "pedidos_saida_requisitante_id_data_pedido_idx" ON "pedidos_saida"("requisitante_id", "data_pedido" DESC);

-- CreateIndex
CREATE INDEX "pedidos_saida_data_pedido_idx" ON "pedidos_saida"("data_pedido" DESC);

-- CreateIndex
CREATE INDEX "itens_pedido_saida_produto_id_idx" ON "itens_pedido_saida"("produto_id");

-- CreateIndex
CREATE UNIQUE INDEX "itens_pedido_saida_pedido_id_produto_id_key" ON "itens_pedido_saida"("pedido_id", "produto_id");

-- CreateIndex
CREATE UNIQUE INDEX "movimentacoes_item_saida_id_key" ON "movimentacoes"("item_saida_id");

-- CreateIndex
CREATE UNIQUE INDEX "movimentacoes_estorno_de_id_key" ON "movimentacoes"("estorno_de_id");

-- CreateIndex
CREATE INDEX "movimentacoes_produto_id_data_movimento_idx" ON "movimentacoes"("produto_id", "data_movimento" DESC);

-- CreateIndex
CREATE INDEX "movimentacoes_produto_id_tipo_data_movimento_idx" ON "movimentacoes"("produto_id", "tipo", "data_movimento" DESC);

-- CreateIndex
CREATE INDEX "movimentacoes_item_entrada_id_idx" ON "movimentacoes"("item_entrada_id");

-- AddForeignKey
ALTER TABLE "produtos_fornecedores" ADD CONSTRAINT "produtos_fornecedores_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos_fornecedores" ADD CONSTRAINT "produtos_fornecedores_fornecedor_id_fkey" FOREIGN KEY ("fornecedor_id") REFERENCES "fornecedores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_entrada" ADD CONSTRAINT "pedidos_entrada_fornecedor_id_fkey" FOREIGN KEY ("fornecedor_id") REFERENCES "fornecedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_pedido_entrada" ADD CONSTRAINT "itens_pedido_entrada_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos_entrada"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_pedido_entrada" ADD CONSTRAINT "itens_pedido_entrada_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_saida" ADD CONSTRAINT "pedidos_saida_requisitante_id_fkey" FOREIGN KEY ("requisitante_id") REFERENCES "requisitantes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_pedido_saida" ADD CONSTRAINT "itens_pedido_saida_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos_saida"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_pedido_saida" ADD CONSTRAINT "itens_pedido_saida_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacoes" ADD CONSTRAINT "movimentacoes_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacoes" ADD CONSTRAINT "movimentacoes_item_entrada_id_fkey" FOREIGN KEY ("item_entrada_id") REFERENCES "itens_pedido_entrada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacoes" ADD CONSTRAINT "movimentacoes_item_saida_id_fkey" FOREIGN KEY ("item_saida_id") REFERENCES "itens_pedido_saida"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacoes" ADD CONSTRAINT "movimentacoes_estorno_de_id_fkey" FOREIGN KEY ("estorno_de_id") REFERENCES "movimentacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable pedidos_entrada: adiciona numero_oc
ALTER TABLE "pedidos_entrada" ADD COLUMN IF NOT EXISTS "numero_oc" VARCHAR(40);
CREATE UNIQUE INDEX IF NOT EXISTS "pedidos_entrada_numero_oc_key" ON "pedidos_entrada"("numero_oc");

-- Preenche numero_oc nos pedidos já enviados/recebidos
UPDATE "pedidos_entrada"
   SET "numero_oc" = 'OC-' || LPAD("id"::text, 4, '0')
 WHERE "numero_oc" IS NULL
   AND "status" IN ('ENVIADO', 'RECEBIDO_PARCIAL', 'RECEBIDO');

-- CreateEnum status_recebimento
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_recebimento') THEN
    CREATE TYPE "status_recebimento" AS ENUM ('AGUARDANDO_NF', 'CONCLUIDO');
  END IF;
END $$;

-- CreateTable recebimentos_entrada
CREATE TABLE IF NOT EXISTS "recebimentos_entrada" (
    "id" SERIAL NOT NULL,
    "pedido_id" INTEGER NOT NULL,
    "status" "status_recebimento" NOT NULL DEFAULT 'AGUARDANDO_NF',
    "numero_nf" VARCHAR(60),
    "observacao" TEXT,
    "recebido_por_nome" VARCHAR(120),
    "nf_lancada_por_nome" VARCHAR(120),
    "data_recebimento" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data_nf" TIMESTAMPTZ(6),

    CONSTRAINT "recebimentos_entrada_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "recebimentos_entrada_pedido_id_fkey"
      FOREIGN KEY ("pedido_id") REFERENCES "pedidos_entrada"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "recebimentos_entrada_pedido_id_data_recebimento_idx"
  ON "recebimentos_entrada"("pedido_id", "data_recebimento" DESC);

CREATE INDEX IF NOT EXISTS "recebimentos_entrada_status_data_recebimento_idx"
  ON "recebimentos_entrada"("status", "data_recebimento" DESC);

-- CreateTable itens_recebimento_entrada
CREATE TABLE IF NOT EXISTS "itens_recebimento_entrada" (
    "id" SERIAL NOT NULL,
    "recebimento_id" INTEGER NOT NULL,
    "item_pedido_id" INTEGER NOT NULL,
    "produto_id" INTEGER NOT NULL,
    "quantidade" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "itens_recebimento_entrada_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "itens_recebimento_entrada_recebimento_id_fkey"
      FOREIGN KEY ("recebimento_id") REFERENCES "recebimentos_entrada"("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "itens_recebimento_entrada_item_pedido_id_fkey"
      FOREIGN KEY ("item_pedido_id") REFERENCES "itens_pedido_entrada"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "itens_recebimento_entrada_recebimento_id_item_pedido_id_key"
  ON "itens_recebimento_entrada"("recebimento_id", "item_pedido_id");


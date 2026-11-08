-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "status_pedido_entrada" ADD VALUE 'APROVADO';
ALTER TYPE "status_pedido_entrada" ADD VALUE 'RECUSADO';

-- AlterTable
ALTER TABLE "pedidos_entrada" ADD COLUMN     "solicitante_id" INTEGER;

-- CreateIndex
CREATE INDEX "pedidos_entrada_solicitante_id_data_pedido_idx" ON "pedidos_entrada"("solicitante_id", "data_pedido" DESC);

-- CreateIndex
CREATE INDEX "pedidos_entrada_previsao_entrega_idx" ON "pedidos_entrada"("previsao_entrega");

-- CreateIndex
CREATE INDEX "pedidos_entrada_data_recebimento_idx" ON "pedidos_entrada"("data_recebimento");

-- AddForeignKey
ALTER TABLE "pedidos_entrada" ADD CONSTRAINT "pedidos_entrada_solicitante_id_fkey" FOREIGN KEY ("solicitante_id") REFERENCES "requisitantes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

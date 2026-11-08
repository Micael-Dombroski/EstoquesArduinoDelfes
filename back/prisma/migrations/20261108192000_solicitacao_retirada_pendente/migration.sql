-- Adiciona o status PENDENTE aos pedidos de saída e os campos de separação em itens_pedido_saida
ALTER TYPE "status_pedido_saida" ADD VALUE IF NOT EXISTS 'PENDENTE';

ALTER TABLE "itens_pedido_saida"
  ADD COLUMN IF NOT EXISTS "separado" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "quantidade_separada" DECIMAL(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "situacao_faltante" VARCHAR(30);

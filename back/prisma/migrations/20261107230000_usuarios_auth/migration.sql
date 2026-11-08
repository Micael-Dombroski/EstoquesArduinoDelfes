-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'perfil_usuario') THEN
    CREATE TYPE "perfil_usuario" AS ENUM ('SOLICITANTE', 'ALMOXARIFADO', 'COMPRAS', 'SUPERVISOR');
  END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "usuarios" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "email" VARCHAR(150) NOT NULL,
    "senha_hash" VARCHAR(255) NOT NULL,
    "perfil" "perfil_usuario" NOT NULL,
    "requisitante_id" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "usuarios_ativo_perfil_idx" ON "usuarios"("ativo", "perfil");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_requisitante_id_fkey') THEN
    ALTER TABLE "usuarios"
      ADD CONSTRAINT "usuarios_requisitante_id_fkey"
      FOREIGN KEY ("requisitante_id") REFERENCES "requisitantes"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;


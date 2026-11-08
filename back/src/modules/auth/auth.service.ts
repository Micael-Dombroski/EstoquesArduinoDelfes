import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../shared/AppError';
import type { LoginInput, Perfil } from './auth.schemas';

const SEGREDO = process.env.JWT_SECRET ?? 'estoque-delfes-segredo-dev-2026';
const DURACAO_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

export type UsuarioSessao = {
  id: number;
  nome: string;
  email: string;
  perfil: Perfil;
  requisitanteId: number | null;
};

type TokenPayload = UsuarioSessao & { exp: number };

export function hashSenha(senha: string): string {
  return createHash('sha256').update(senha).digest('hex');
}

export function gerarToken(usuario: UsuarioSessao): string {
  const payload: TokenPayload = { ...usuario, exp: Date.now() + DURACAO_MS };
  const dados = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const assinatura = createHmac('sha256', SEGREDO).update(dados).digest('base64url');
  return `${dados}.${assinatura}`;
}

export function verificarToken(token: string): UsuarioSessao {
  const partes = token.split('.');
  if (partes.length !== 2) {
    throw new AppError(401, 'TOKEN_INVALIDO', 'Sessão inválida. Faça login novamente.');
  }
  const [dados, assinatura] = partes;
  const esperada = createHmac('sha256', SEGREDO).update(dados).digest('base64url');

  const bufAssinatura = Buffer.from(assinatura);
  const bufEsperada = Buffer.from(esperada);
  if (bufAssinatura.length !== bufEsperada.length || !timingSafeEqual(bufAssinatura, bufEsperada)) {
    throw new AppError(401, 'TOKEN_INVALIDO', 'Sessão inválida. Faça login novamente.');
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(dados, 'base64url').toString('utf8')) as TokenPayload;
  } catch {
    throw new AppError(401, 'TOKEN_INVALIDO', 'Sessão inválida. Faça login novamente.');
  }

  if (!payload.exp || Date.now() > payload.exp) {
    throw new AppError(401, 'TOKEN_EXPIRADO', 'Sua sessão expirou. Faça login novamente.');
  }

  return {
    id: payload.id,
    nome: payload.nome,
    email: payload.email,
    perfil: payload.perfil,
    requisitanteId: payload.requisitanteId ?? null,
  };
}

let inicializado = false;

/**
 * Garante que a tabela `usuarios` e os 4 perfis padrão de demonstração existam
 * mesmo se o container do banco tiver sido iniciado antes da migração de usuários.
 */
async function garantirUsuariosPadrao() {
  if (inicializado) return;
  try {
    const total = await prisma.usuario.count();
    if (total > 0) {
      inicializado = true;
      return;
    }
  } catch {
    // Tabela ou enum ainda não existe no banco: cria de forma idempotente
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'perfil_usuario') THEN
          CREATE TYPE "perfil_usuario" AS ENUM ('SOLICITANTE', 'ALMOXARIFADO', 'COMPRAS', 'SUPERVISOR');
        END IF;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "usuarios" (
        "id" SERIAL PRIMARY KEY,
        "nome" VARCHAR(120) NOT NULL,
        "email" VARCHAR(150) NOT NULL UNIQUE,
        "senha_hash" VARCHAR(255) NOT NULL,
        "perfil" "perfil_usuario" NOT NULL,
        "requisitante_id" INTEGER REFERENCES "requisitantes"("id") ON DELETE SET NULL ON UPDATE CASCADE,
        "ativo" BOOLEAN NOT NULL DEFAULT true,
        "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  const senhaPadrao = hashSenha('123456');
  const reqs = await prisma.requisitante.findMany({ select: { id: true }, orderBy: { id: 'asc' } });
  const reqIds = new Set(reqs.map((r) => r.id));

  const padroes: Array<{ nome: string; email: string; perfil: Perfil; requisitanteId: number | null }> = [
    {
      nome: 'Ana Beatriz Lima',
      email: 'solicitante@estoque.local',
      perfil: 'SOLICITANTE',
      requisitanteId: reqIds.has(1) ? 1 : null,
    },
    {
      nome: 'Carlos Eduardo Rocha',
      email: 'almoxarifado@estoque.local',
      perfil: 'ALMOXARIFADO',
      requisitanteId: reqIds.has(2) ? 2 : null,
    },
    {
      nome: 'Paula Ribeiro',
      email: 'compras@estoque.local',
      perfil: 'COMPRAS',
      requisitanteId: null,
    },
    {
      nome: 'Roberto Nunes',
      email: 'supervisor@estoque.local',
      perfil: 'SUPERVISOR',
      requisitanteId: reqIds.has(6) ? 6 : null,
    },
  ];

  for (const u of padroes) {
    await prisma.usuario.upsert({
      where: { email: u.email },
      update: {},
      create: {
        nome: u.nome,
        email: u.email,
        senhaHash: senhaPadrao,
        perfil: u.perfil,
        requisitanteId: u.requisitanteId,
      },
    });
  }
  inicializado = true;
}

export async function login(input: LoginInput) {
  await garantirUsuariosPadrao();

  const email = input.email.toLowerCase();
  const usuario = await prisma.usuario.findUnique({ where: { email } });

  if (!usuario || !usuario.ativo || usuario.senhaHash !== hashSenha(input.senha)) {
    throw new AppError(401, 'CREDENCIAIS_INVALIDAS', 'E-mail ou senha incorretos.');
  }

  const sessao: UsuarioSessao = {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    perfil: usuario.perfil,
    requisitanteId: usuario.requisitanteId,
  };

  return {
    token: gerarToken(sessao),
    usuario: sessao,
  };
}

export async function listarUsuariosDemo() {
  await garantirUsuariosPadrao();
  const data = await prisma.usuario.findMany({
    where: { ativo: true },
    select: { id: true, nome: true, email: true, perfil: true, requisitanteId: true },
    orderBy: { id: 'asc' },
  });
  return { data };
}


import type { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../shared/AppError';
import { garantirUsuariosPadrao, hashSenha } from '../auth/auth.service';
import type { AtualizarUsuario, CriarUsuario, ListarUsuarios } from './usuarios.schemas';

const selecionarUsuario = {
  id: true,
  nome: true,
  email: true,
  perfil: true,
  requisitanteId: true,
  ativo: true,
  criadoEm: true,
  requisitante: {
    select: {
      id: true,
      nome: true,
      setor: true,
      ativo: true,
    },
  },
} satisfies Prisma.UsuarioSelect;

export async function listar(q: ListarUsuarios) {
  await garantirUsuariosPadrao();

  const where: Prisma.UsuarioWhereInput = {
    ...(q.perfil ? { perfil: q.perfil } : {}),
    ...(q.ativo !== undefined ? { ativo: q.ativo === 'true' } : {}),
    ...(q.busca
      ? {
          OR: [
            { nome: { contains: q.busca, mode: 'insensitive' } },
            { email: { contains: q.busca, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const data = await prisma.usuario.findMany({
    where,
    select: selecionarUsuario,
    orderBy: [{ ativo: 'desc' }, { nome: 'asc' }],
  });

  return { data };
}

export async function obter(id: number) {
  await garantirUsuariosPadrao();
  const usuario = await prisma.usuario.findUnique({
    where: { id },
    select: selecionarUsuario,
  });
  if (!usuario) throw new AppError(404, 'NAO_ENCONTRADO', 'Usuário não encontrado.');
  return { data: usuario };
}

export async function criar(input: CriarUsuario) {
  await garantirUsuariosPadrao();

  const email = input.email.toLowerCase();
  const existente = await prisma.usuario.findUnique({ where: { email } });
  if (existente) {
    throw new AppError(409, 'EMAIL_DUPLICADO', 'Já existe um usuário cadastrado com este e-mail.');
  }

  if (input.requisitanteId) {
    const req = await prisma.requisitante.findUnique({ where: { id: input.requisitanteId } });
    if (!req) throw new AppError(422, 'REQUISITANTE_INVALIDO', 'Funcionário/destinatário vinculado não encontrado.');
  }

  const criado = await prisma.$transaction(async (tx) => {
    let reqId = input.requisitanteId ?? null;

    if (!reqId && input.criarRequisitanteAutomatico) {
      const novoReq = await tx.requisitante.create({
        data: {
          nome: input.nome,
          setor: input.setorRequisitante?.trim() || input.perfil,
          ativo: true,
        },
      });
      reqId = novoReq.id;
    }

    return tx.usuario.create({
      data: {
        nome: input.nome,
        email,
        senhaHash: hashSenha(input.senha),
        perfil: input.perfil,
        requisitanteId: reqId,
        ativo: input.ativo ?? true,
      },
      select: selecionarUsuario,
    });
  });

  return { data: criado };
}

export async function atualizar(id: number, input: AtualizarUsuario, usuarioLogadoId?: number) {
  await garantirUsuariosPadrao();

  const atual = await prisma.usuario.findUnique({ where: { id } });
  if (!atual) throw new AppError(404, 'NAO_ENCONTRADO', 'Usuário não encontrado.');

  if (usuarioLogadoId === id) {
    if (input.ativo === false) {
      throw new AppError(422, 'OPERACAO_NAO_PERMITIDA', 'Você não pode desativar a sua própria conta de Supervisor.');
    }
    if (input.perfil && input.perfil !== 'SUPERVISOR') {
      throw new AppError(
        422,
        'OPERACAO_NAO_PERMITIDA',
        'Você não pode remover o perfil de Supervisor da sua própria conta.',
      );
    }
  }

  let novoEmail: string | undefined;
  if (input.email !== undefined) {
    novoEmail = input.email.toLowerCase();
    if (novoEmail !== atual.email) {
      const duplicado = await prisma.usuario.findUnique({ where: { email: novoEmail } });
      if (duplicado) {
        throw new AppError(409, 'EMAIL_DUPLICADO', 'Já existe outro usuário utilizando este e-mail.');
      }
    }
  }

  if (input.requisitanteId) {
    const req = await prisma.requisitante.findUnique({ where: { id: input.requisitanteId } });
    if (!req) throw new AppError(422, 'REQUISITANTE_INVALIDO', 'Funcionário/destinatário vinculado não encontrado.');
  }

  const atualizado = await prisma.usuario.update({
    where: { id },
    data: {
      ...(input.nome !== undefined ? { nome: input.nome } : {}),
      ...(novoEmail !== undefined ? { email: novoEmail } : {}),
      ...(input.senha && input.senha.length >= 6 ? { senhaHash: hashSenha(input.senha) } : {}),
      ...(input.perfil !== undefined ? { perfil: input.perfil } : {}),
      ...(input.requisitanteId !== undefined ? { requisitanteId: input.requisitanteId } : {}),
      ...(input.ativo !== undefined ? { ativo: input.ativo } : {}),
    },
    select: selecionarUsuario,
  });

  return { data: atualizado };
}

export async function remover(id: number, usuarioLogadoId?: number) {
  await garantirUsuariosPadrao();

  if (usuarioLogadoId === id) {
    throw new AppError(422, 'OPERACAO_NAO_PERMITIDA', 'Você não pode excluir a sua própria conta em uso.');
  }

  const atual = await prisma.usuario.findUnique({ where: { id } });
  if (!atual) throw new AppError(404, 'NAO_ENCONTRADO', 'Usuário não encontrado.');

  await prisma.usuario.delete({ where: { id } });
}

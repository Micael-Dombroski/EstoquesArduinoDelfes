import type { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../shared/AppError';
import { paginar, respostaPaginada } from '../../shared/pagination';
import type { AtualizarRequisitante, CriarRequisitante, ListarRequisitantes } from './requisitantes.schemas';

export async function listar(query: ListarRequisitantes) {
  const where: Prisma.RequisitanteWhereInput = {
    ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
    ...(query.q ? { nome: { contains: query.q, mode: 'insensitive' } } : {}),
  };
  const [data, total] = await Promise.all([
    prisma.requisitante.findMany({ where, orderBy: { nome: 'asc' }, ...paginar(query) }),
    prisma.requisitante.count({ where }),
  ]);
  return respostaPaginada(data, total, query);
}

export async function obter(id: number) {
  const requisitante = await prisma.requisitante.findUnique({ where: { id } });
  if (!requisitante) throw new AppError(404, 'NAO_ENCONTRADO', 'Requisitante não encontrado');
  return requisitante;
}

export const criar = (dados: CriarRequisitante) => prisma.requisitante.create({ data: dados });

export const atualizar = (id: number, dados: AtualizarRequisitante) =>
  prisma.requisitante.update({ where: { id }, data: dados });

export const desativar = (id: number) =>
  prisma.requisitante.update({ where: { id }, data: { ativo: false } });

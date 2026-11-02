import type { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../shared/AppError';
import { paginar, respostaPaginada } from '../../shared/pagination';
import { vazioParaNulo } from '../../shared/schemas';
import type { AtualizarFornecedor, CriarFornecedor, ListarFornecedores } from './fornecedores.schemas';

export async function listar(query: ListarFornecedores) {
  const where: Prisma.FornecedorWhereInput = {
    ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
    ...(query.q ? { nome: { contains: query.q, mode: 'insensitive' } } : {}),
  };
  const [data, total] = await Promise.all([
    prisma.fornecedor.findMany({ where, orderBy: { nome: 'asc' }, ...paginar(query) }),
    prisma.fornecedor.count({ where }),
  ]);
  return respostaPaginada(data, total, query);
}

export async function obter(id: number) {
  const fornecedor = await prisma.fornecedor.findUnique({
    where: { id },
    include: {
      produtos: {
        include: { produto: { select: { id: true, codigo: true, nome: true, unidade: true } } },
      },
    },
  });
  if (!fornecedor) throw new AppError(404, 'NAO_ENCONTRADO', 'Fornecedor não encontrado');
  return fornecedor;
}

export const criar = (dados: CriarFornecedor) => prisma.fornecedor.create({ data: vazioParaNulo(dados) });

export const atualizar = (id: number, dados: AtualizarFornecedor) =>
  prisma.fornecedor.update({ where: { id }, data: vazioParaNulo(dados) });

export const desativar = (id: number) =>
  prisma.fornecedor.update({ where: { id }, data: { ativo: false } });

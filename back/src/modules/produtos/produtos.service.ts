import type { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../shared/AppError';
import { paginar, respostaPaginada } from '../../shared/pagination';
import type { AtualizarProduto, CriarProduto, ListarProdutos, VinculoBody } from './produtos.schemas';

const filtroTexto = (q: string): Prisma.ProdutoWhereInput => ({
  OR: [
    { nome: { contains: q, mode: 'insensitive' } },
    { codigo: { contains: q, mode: 'insensitive' } },
  ],
});

export async function listar(query: ListarProdutos) {
  const where: Prisma.ProdutoWhereInput = {
    ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
    ...(query.q ? filtroTexto(query.q) : {}),
  };
  const [data, total] = await Promise.all([
    prisma.produto.findMany({ where, orderBy: { nome: 'asc' }, ...paginar(query) }),
    prisma.produto.count({ where }),
  ]);
  return respostaPaginada(data, total, query);
}

/** Autocomplete da tela de saída: resposta enxuta, só produtos ativos. */
export function buscar(q: string, limit: number) {
  return prisma.produto.findMany({
    where: { ativo: true, ...filtroTexto(q) },
    select: { id: true, codigo: true, nome: true, unidade: true, marca: true, saldoAtual: true },
    orderBy: { nome: 'asc' },
    take: limit,
  });
}

/** Leitor de código de barras: match exato. */
export async function porCodigo(codigo: string) {
  const produto = await prisma.produto.findUnique({ where: { codigo } });
  if (!produto || !produto.ativo) throw new AppError(404, 'NAO_ENCONTRADO', 'Produto não encontrado');
  return produto;
}

export async function obter(id: number) {
  const produto = await prisma.produto.findUnique({
    where: { id },
    include: {
      fornecedores: {
        include: { fornecedor: { select: { id: true, nome: true } } },
        orderBy: { preferencial: 'desc' },
      },
    },
  });
  if (!produto) throw new AppError(404, 'NAO_ENCONTRADO', 'Produto não encontrado');
  return produto;
}

export const criar = (dados: CriarProduto) => prisma.produto.create({ data: dados });

export const atualizar = (id: number, dados: AtualizarProduto) =>
  prisma.produto.update({ where: { id }, data: dados });

/** Soft delete: o histórico de movimentações precisa continuar apontando para o produto. */
export const desativar = (id: number) =>
  prisma.produto.update({ where: { id }, data: { ativo: false } });

export function salvarVinculo(produtoId: number, fornecedorId: number, dados: VinculoBody) {
  return prisma.$transaction(async (tx) => {
    const produto = await tx.produto.findUnique({ where: { id: produtoId }, select: { id: true } });
    if (!produto) throw new AppError(404, 'NAO_ENCONTRADO', 'Produto não encontrado');
    const fornecedor = await tx.fornecedor.findUnique({ where: { id: fornecedorId }, select: { id: true } });
    if (!fornecedor) throw new AppError(404, 'NAO_ENCONTRADO', 'Fornecedor não encontrado');

    // índice único parcial: só um preferencial por produto -> desmarca os outros primeiro
    if (dados.preferencial) {
      await tx.produtoFornecedor.updateMany({
        where: { produtoId, NOT: { fornecedorId } },
        data: { preferencial: false },
      });
    }

    return tx.produtoFornecedor.upsert({
      where: { produtoId_fornecedorId: { produtoId, fornecedorId } },
      create: { produtoId, fornecedorId, ...dados },
      update: dados,
    });
  });
}

export const removerVinculo = (produtoId: number, fornecedorId: number) =>
  prisma.produtoFornecedor.delete({
    where: { produtoId_fornecedorId: { produtoId, fornecedorId } },
  });

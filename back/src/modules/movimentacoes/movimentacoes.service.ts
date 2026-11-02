import type { Prisma } from '../../generated/prisma/client';
import { prisma, type Tx } from '../../lib/prisma';
import { AppError } from '../../shared/AppError';
import { paginar, respostaPaginada } from '../../shared/pagination';
import { intervalo } from '../../shared/schemas';
import { recalcularStatus } from '../pedidos-entrada/pedidos-entrada.service';
import type { AjusteBody, ListarMovimentacoes } from './movimentacoes.schemas';

const incluirProduto = {
  produto: { select: { id: true, codigo: true, nome: true, unidade: true } },
} satisfies Prisma.MovimentacaoInclude;

export async function listar(q: ListarMovimentacoes) {
  const periodo = intervalo(q.de, q.ate);
  const where: Prisma.MovimentacaoWhereInput = {
    ...(q.produtoId ? { produtoId: q.produtoId } : {}),
    ...(q.tipo ? { tipo: q.tipo } : {}),
    ...(periodo ? { dataMovimento: periodo } : {}),
  };
  const [data, total] = await Promise.all([
    prisma.movimentacao.findMany({
      where,
      include: { ...incluirProduto, estorno: { select: { id: true } } }, // "estorno" indica que já foi desfeita
      orderBy: [{ dataMovimento: 'desc' }, { id: 'desc' }],
      ...paginar(q),
    }),
    prisma.movimentacao.count({ where }),
  ]);
  return respostaPaginada(data, total, q);
}

export async function obter(id: number) {
  const mov = await prisma.movimentacao.findUnique({
    where: { id },
    include: { ...incluirProduto, estorno: true, estornoDe: true },
  });
  if (!mov) throw new AppError(404, 'NAO_ENCONTRADO', 'Movimentação não encontrada');
  return mov;
}

export async function ajustar(input: AjusteBody) {
  const produto = await prisma.produto.findUnique({ where: { id: input.produtoId }, select: { id: true } });
  if (!produto) throw new AppError(404, 'NAO_ENCONTRADO', 'Produto não encontrado');

  return prisma.movimentacao.create({
    data: { produtoId: input.produtoId, tipo: 'AJUSTE', variacao: input.variacao, observacao: input.observacao },
    include: incluirProduto,
  });
}

type MovimentacaoOriginal = {
  id: number;
  produtoId: number;
  variacao: Prisma.Decimal;
  itemEntradaId: number | null;
};

/**
 * Cria o ESTORNO (variação oposta) dentro de uma transação já aberta.
 * Exportada para o cancelamento de pedido de saída reaproveitar.
 */
export async function criarEstorno(tx: Tx, original: MovimentacaoOriginal, observacao?: string | null) {
  const estorno = await tx.movimentacao.create({
    data: {
      produtoId: original.produtoId,
      tipo: 'ESTORNO',
      variacao: original.variacao.neg(),
      estornoDeId: original.id,
      observacao: observacao ?? null,
    },
  });

  // Estorno de um recebimento: devolve a quantidade ao item (mantém o "já a caminho" da view
  // vw_sugestao_reposicao correto) e recalcula o status do pedido.
  if (original.itemEntradaId) {
    const item = await tx.itemPedidoEntrada.update({
      where: { id: original.itemEntradaId },
      data: { quantidadeRecebida: { decrement: original.variacao } },
    });
    await recalcularStatus(tx, item.pedidoId);
  }

  return estorno;
}

export function estornar(id: number, observacao?: string | null) {
  return prisma.$transaction(async (tx) => {
    const original = await tx.movimentacao.findUnique({ where: { id }, include: { estorno: true } });
    if (!original) throw new AppError(404, 'NAO_ENCONTRADO', 'Movimentação não encontrada');
    if (original.tipo === 'ESTORNO') throw new AppError(422, 'NAO_ESTORNAVEL', 'Não é possível estornar um estorno');
    if (original.estorno) throw new AppError(409, 'JA_ESTORNADA', 'Esta movimentação já foi estornada');
    return criarEstorno(tx, original, observacao);
  });
}

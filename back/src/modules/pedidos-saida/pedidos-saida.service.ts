import type { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../shared/AppError';
import { paginar, respostaPaginada } from '../../shared/pagination';
import { intervalo } from '../../shared/schemas';
import { criarEstorno } from '../movimentacoes/movimentacoes.service';
import type { CriarSaida, ListarSaidas } from './pedidos-saida.schemas';

const incluirDetalhe = {
  requisitante: { select: { id: true, nome: true, setor: true } },
  itens: {
    include: { produto: { select: { id: true, codigo: true, nome: true, unidade: true, saldoAtual: true } } },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.PedidoSaidaInclude;

export async function listar(q: ListarSaidas) {
  const periodo = intervalo(q.de, q.ate);
  const where: Prisma.PedidoSaidaWhereInput = {
    ...(q.requisitanteId ? { requisitanteId: q.requisitanteId } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(periodo ? { dataPedido: periodo } : {}),
  };
  const [data, total] = await Promise.all([
    prisma.pedidoSaida.findMany({
      where,
      include: { requisitante: { select: { id: true, nome: true } }, _count: { select: { itens: true } } },
      orderBy: { dataPedido: 'desc' },
      ...paginar(q),
    }),
    prisma.pedidoSaida.count({ where }),
  ]);
  return respostaPaginada(data, total, q);
}

export async function obter(id: number) {
  const pedido = await prisma.pedidoSaida.findUnique({ where: { id }, include: incluirDetalhe });
  if (!pedido) throw new AppError(404, 'NAO_ENCONTRADO', 'Pedido de saída não encontrado');
  return pedido;
}

/**
 * Se o CHECK de saldo disparou, descobre quais itens faltaram para dar uma mensagem útil.
 * (A transação já foi desfeita, então o saldo lido aqui é o atual.)
 */
async function detalharSaldoInsuficiente(err: unknown, itens: CriarSaida['itens']) {
  if (!String((err as Error)?.message ?? '').includes('ck_produtos_saldo_nao_negativo')) return err;

  const produtos = await prisma.produto.findMany({
    where: { id: { in: itens.map((i) => i.produtoId) } },
    select: { id: true, codigo: true, nome: true, saldoAtual: true },
  });
  const faltando = itens.flatMap((i) => {
    const p = produtos.find((x) => x.id === i.produtoId);
    return p && p.saldoAtual.lt(i.quantidade)
      ? [{ produtoId: p.id, codigo: p.codigo, nome: p.nome, saldoAtual: p.saldoAtual.toString(), solicitado: i.quantidade }]
      : [];
  });
  return new AppError(422, 'SALDO_INSUFICIENTE', 'Saldo insuficiente para um ou mais itens', faltando);
}

/** Cria o pedido (já CONCLUIDO) e uma movimentação SAIDA por item, tudo na mesma transação. */
export async function criar(input: CriarSaida) {
  // ordem fixa por produto: evita deadlock entre saídas simultâneas (a trigger trava a linha do produto)
  const itens = [...input.itens].sort((a, b) => a.produtoId - b.produtoId);

  try {
    return await prisma.$transaction(async (tx) => {
      const requisitante = await tx.requisitante.findUnique({ where: { id: input.requisitanteId } });
      if (!requisitante?.ativo) throw new AppError(422, 'REQUISITANTE_INVALIDO', 'Requisitante inexistente ou inativo');

      const ativos = await tx.produto.count({ where: { id: { in: itens.map((i) => i.produtoId) }, ativo: true } });
      if (ativos !== itens.length) {
        throw new AppError(422, 'PRODUTO_INVALIDO', 'Um ou mais produtos não existem ou estão inativos');
      }

      const pedido = await tx.pedidoSaida.create({
        data: { requisitanteId: input.requisitanteId, observacao: input.observacao, itens: { create: itens } },
        include: { itens: true },
      });

      for (const item of [...pedido.itens].sort((a, b) => a.produtoId - b.produtoId)) {
        await tx.movimentacao.create({
          data: { produtoId: item.produtoId, tipo: 'SAIDA', variacao: item.quantidade.neg(), itemSaidaId: item.id },
        });
      }

      return tx.pedidoSaida.findUniqueOrThrow({ where: { id: pedido.id }, include: incluirDetalhe });
    });
  } catch (err) {
    throw await detalharSaldoInsuficiente(err, itens);
  }
}

/** Cancela estornando cada item que ainda não foi estornado individualmente. */
export async function cancelar(id: number) {
  await prisma.$transaction(async (tx) => {
    const pedido = await tx.pedidoSaida.findUnique({
      where: { id },
      include: { itens: { include: { movimentacao: { include: { estorno: true } } } } },
    });
    if (!pedido) throw new AppError(404, 'NAO_ENCONTRADO', 'Pedido de saída não encontrado');
    if (pedido.status === 'CANCELADO') throw new AppError(409, 'STATUS_INVALIDO', 'Pedido já está cancelado');

    for (const item of [...pedido.itens].sort((a, b) => a.produtoId - b.produtoId)) {
      const mov = item.movimentacao;
      if (mov && !mov.estorno) await criarEstorno(tx, mov, `Cancelamento do pedido de saída #${id}`);
    }

    await tx.pedidoSaida.update({ where: { id }, data: { status: 'CANCELADO' } });
  });

  return obter(id);
}

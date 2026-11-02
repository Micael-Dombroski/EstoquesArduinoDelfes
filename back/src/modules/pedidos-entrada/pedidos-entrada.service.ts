import { Prisma } from '../../generated/prisma/client';
import { prisma, type Tx } from '../../lib/prisma';
import { AppError } from '../../shared/AppError';
import { paginar, respostaPaginada } from '../../shared/pagination';
import { intervalo } from '../../shared/schemas';
import type {
  AtualizarEntrada,
  CriarEntrada,
  ListarEntradas,
  ReceberBody,
  SubstituirItens,
} from './pedidos-entrada.schemas';

const incluirDetalhe = {
  fornecedor: { select: { id: true, nome: true, valorMinimoPedido: true } },
  itens: {
    include: { produto: { select: { id: true, codigo: true, nome: true, unidade: true, marca: true } } },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.PedidoEntradaInclude;

// ---------------------------------------------------------------- helpers

async function carregar(tx: Tx, id: number) {
  const pedido = await tx.pedidoEntrada.findUnique({ where: { id }, include: { itens: true } });
  if (!pedido) throw new AppError(404, 'NAO_ENCONTRADO', 'Pedido de entrada não encontrado');
  return pedido;
}

function exigirStatus(pedido: { status: string }, permitidos: string[], acao: string) {
  if (!permitidos.includes(pedido.status)) {
    throw new AppError(409, 'STATUS_INVALIDO', `Não é possível ${acao} um pedido em ${pedido.status}`);
  }
}

async function validarReferencias(tx: Tx, fornecedorId: number | undefined, produtoIds: number[]) {
  if (fornecedorId !== undefined) {
    const fornecedor = await tx.fornecedor.findUnique({ where: { id: fornecedorId } });
    if (!fornecedor?.ativo) throw new AppError(422, 'FORNECEDOR_INVALIDO', 'Fornecedor inexistente ou inativo');
  }
  if (produtoIds.length > 0) {
    const ativos = await tx.produto.count({ where: { id: { in: produtoIds }, ativo: true } });
    if (ativos !== produtoIds.length) {
      throw new AppError(422, 'PRODUTO_INVALIDO', 'Um ou mais produtos não existem ou estão inativos');
    }
  }
}

/**
 * Recalcula o status a partir das quantidades recebidas.
 * Usado no recebimento e também no estorno de um recebimento (que pode "desfazer" o RECEBIDO).
 */
export async function recalcularStatus(tx: Tx, pedidoId: number) {
  const pedido = await tx.pedidoEntrada.findUniqueOrThrow({ where: { id: pedidoId }, include: { itens: true } });

  if (pedido.status === 'RASCUNHO' || pedido.status === 'CANCELADO') {
    return tx.pedidoEntrada.findUniqueOrThrow({ where: { id: pedidoId }, include: incluirDetalhe });
  }

  const completo = pedido.itens.length > 0 && pedido.itens.every((i) => i.quantidadeRecebida.gte(i.quantidade));
  const algum = pedido.itens.some((i) => i.quantidadeRecebida.gt(0));
  const status = completo ? 'RECEBIDO' : algum ? 'RECEBIDO_PARCIAL' : 'ENVIADO';

  return tx.pedidoEntrada.update({
    where: { id: pedidoId },
    data: {
      status,
      dataRecebimento: completo ? (pedido.dataRecebimento ?? new Date()) : null,
    },
    include: incluirDetalhe,
  });
}

// ---------------------------------------------------------------- consultas

export async function listar(q: ListarEntradas) {
  const periodo = intervalo(q.de, q.ate);
  const where: Prisma.PedidoEntradaWhereInput = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.fornecedorId ? { fornecedorId: q.fornecedorId } : {}),
    ...(periodo ? { dataPedido: periodo } : {}),
  };
  const [data, total] = await Promise.all([
    prisma.pedidoEntrada.findMany({
      where,
      include: { fornecedor: { select: { id: true, nome: true } }, _count: { select: { itens: true } } },
      orderBy: { dataPedido: 'desc' },
      ...paginar(q),
    }),
    prisma.pedidoEntrada.count({ where }),
  ]);
  return respostaPaginada(data, total, q);
}

export async function obter(id: number) {
  const pedido = await prisma.pedidoEntrada.findUnique({ where: { id }, include: incluirDetalhe });
  if (!pedido) throw new AppError(404, 'NAO_ENCONTRADO', 'Pedido de entrada não encontrado');
  return pedido;
}

// ---------------------------------------------------------------- rascunho

export function criar(input: CriarEntrada) {
  return prisma.$transaction(async (tx) => {
    await validarReferencias(tx, input.fornecedorId, input.itens.map((i) => i.produtoId));
    return tx.pedidoEntrada.create({
      data: {
        fornecedorId: input.fornecedorId,
        previsaoEntrega: input.previsaoEntrega,
        observacao: input.observacao,
        itens: { create: input.itens },
      },
      include: incluirDetalhe,
    });
  });
}

export function atualizarCabecalho(id: number, input: AtualizarEntrada) {
  return prisma.$transaction(async (tx) => {
    exigirStatus(await carregar(tx, id), ['RASCUNHO'], 'editar');
    await validarReferencias(tx, input.fornecedorId, []);
    return tx.pedidoEntrada.update({ where: { id }, data: input, include: incluirDetalhe });
  });
}

/** Troca a lista inteira de itens (só em RASCUNHO). */
export function substituirItens(id: number, input: SubstituirItens) {
  return prisma.$transaction(async (tx) => {
    exigirStatus(await carregar(tx, id), ['RASCUNHO'], 'editar os itens de');
    await validarReferencias(tx, undefined, input.itens.map((i) => i.produtoId));
    await tx.itemPedidoEntrada.deleteMany({ where: { pedidoId: id } });
    await tx.itemPedidoEntrada.createMany({ data: input.itens.map((i) => ({ pedidoId: id, ...i })) });
    return tx.pedidoEntrada.findUniqueOrThrow({ where: { id }, include: incluirDetalhe });
  });
}

export function excluir(id: number) {
  return prisma.$transaction(async (tx) => {
    exigirStatus(await carregar(tx, id), ['RASCUNHO'], 'excluir');
    await tx.pedidoEntrada.delete({ where: { id } }); // itens saem por cascade
  });
}

// ---------------------------------------------------------------- transições

export function enviar(id: number) {
  return prisma.$transaction(async (tx) => {
    const pedido = await carregar(tx, id);
    exigirStatus(pedido, ['RASCUNHO'], 'enviar');
    if (pedido.itens.length === 0) throw new AppError(422, 'PEDIDO_SEM_ITENS', 'O pedido não tem itens');

    // sem previsão informada: usa o maior prazo de entrega entre os itens para este fornecedor
    let previsaoEntrega = pedido.previsaoEntrega;
    if (!previsaoEntrega) {
      const vinculos = await tx.produtoFornecedor.findMany({
        where: { fornecedorId: pedido.fornecedorId, produtoId: { in: pedido.itens.map((i) => i.produtoId) } },
        select: { prazoEntregaDias: true },
      });
      if (vinculos.length > 0) {
        previsaoEntrega = new Date();
        previsaoEntrega.setDate(previsaoEntrega.getDate() + Math.max(...vinculos.map((v) => v.prazoEntregaDias)));
      }
    }

    return tx.pedidoEntrada.update({
      where: { id },
      data: { status: 'ENVIADO', previsaoEntrega },
      include: incluirDetalhe,
    });
  });
}

/** Recebimento total ou parcial: cada linha gera uma movimentação ENTRADA. */
export function receber(id: number, input: ReceberBody) {
  return prisma.$transaction(async (tx) => {
    const pedido = await carregar(tx, id);
    exigirStatus(pedido, ['ENVIADO', 'RECEBIDO_PARCIAL'], 'receber');

    const linhas = input.itens
      .map((r) => {
        const item = pedido.itens.find((i) => i.id === r.itemId);
        if (!item) throw new AppError(422, 'ITEM_INVALIDO', `O item ${r.itemId} não pertence ao pedido`);
        return { item, quantidade: new Prisma.Decimal(r.quantidade) };
      })
      // ordem fixa por produto: evita deadlock entre transações concorrentes (a trigger trava a linha do produto)
      .sort((a, b) => a.item.produtoId - b.item.produtoId);

    for (const { item, quantidade } of linhas) {
      if (item.quantidadeRecebida.plus(quantidade).gt(item.quantidade)) {
        throw new AppError(422, 'EXCEDE_PEDIDO', `Recebimento maior que o pedido (produto ${item.produtoId})`);
      }
      await tx.itemPedidoEntrada.update({
        where: { id: item.id },
        data: { quantidadeRecebida: { increment: quantidade } },
      });
      await tx.movimentacao.create({
        data: { produtoId: item.produtoId, tipo: 'ENTRADA', variacao: quantidade, itemEntradaId: item.id },
      });
    }

    return recalcularStatus(tx, id);
  });
}

/** Cancelar NÃO reverte o que já foi recebido; para isso, estorne as movimentações. */
export function cancelar(id: number) {
  return prisma.$transaction(async (tx) => {
    exigirStatus(await carregar(tx, id), ['RASCUNHO', 'ENVIADO', 'RECEBIDO_PARCIAL'], 'cancelar');
    return tx.pedidoEntrada.update({ where: { id }, data: { status: 'CANCELADO' }, include: incluirDetalhe });
  });
}

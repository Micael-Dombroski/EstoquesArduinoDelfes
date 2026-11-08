import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../shared/AppError';
import { paginar, respostaPaginada } from '../../shared/pagination';
import { intervalo } from '../../shared/schemas';
import { criarEstorno } from '../movimentacoes/movimentacoes.service';
import type { BaixarSaida, CriarSaida, ListarSaidas, SepararSaida } from './pedidos-saida.schemas';

const incluirDetalhe = {
  requisitante: { select: { id: true, nome: true, setor: true } },
  itens: {
    include: {
      produto: {
        select: {
          id: true,
          codigo: true,
          nome: true,
          unidade: true,
          marca: true,
          saldoAtual: true,
          pontoReposicao: true,
          itensEntrada: {
            where: {
              pedido: { status: { in: ['RASCUNHO', 'APROVADO', 'ENVIADO', 'RECEBIDO_PARCIAL'] } },
            },
            select: {
              id: true,
              quantidade: true,
              quantidadeRecebida: true,
              pedido: {
                select: {
                  id: true,
                  numeroOc: true,
                  status: true,
                  previsaoEntrega: true,
                },
              },
            },
            orderBy: { id: 'desc' },
            take: 3,
          },
        },
      },
    },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.PedidoSaidaInclude;

let estruturaSaidaInicializada = false;

async function garantirEstruturaSaida() {
  if (estruturaSaidaInicializada) return;
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TYPE "status_pedido_saida" ADD VALUE IF NOT EXISTS 'PENDENTE';
      ALTER TABLE "itens_pedido_saida"
        ADD COLUMN IF NOT EXISTS "separado" BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "quantidade_separada" DECIMAL(12,3) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "situacao_faltante" VARCHAR(30);
    `);
    estruturaSaidaInicializada = true;
  } catch {
    estruturaSaidaInicializada = true;
  }
}

export async function listar(q: ListarSaidas) {
  await garantirEstruturaSaida();
  const periodo = intervalo(q.de, q.ate);
  const where: Prisma.PedidoSaidaWhereInput = {
    ...(q.requisitanteId ? { requisitanteId: q.requisitanteId } : {}),
    ...(q.produtoId ? { itens: { some: { produtoId: q.produtoId } } } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(periodo ? { dataPedido: periodo } : {}),
  };
  const [data, total] = await Promise.all([
    prisma.pedidoSaida.findMany({
      where,
      include: {
        ...incluirDetalhe,
        _count: { select: { itens: true } },
      },
      orderBy: { dataPedido: 'desc' },
      ...paginar(q),
    }),
    prisma.pedidoSaida.count({ where }),
  ]);
  return respostaPaginada(data, total, q);
}

export async function obter(id: number) {
  await garantirEstruturaSaida();
  const pedido = await prisma.pedidoSaida.findUnique({ where: { id }, include: incluirDetalhe });
  if (!pedido) throw new AppError(404, 'NAO_ENCONTRADO', 'Pedido de saída não encontrado');
  return pedido;
}

/**
 * Se o CHECK de saldo disparou, descobre quais itens faltaram para dar uma mensagem útil.
 * (A transação já foi desfeita, então o saldo lido aqui é o atual.)
 */
async function detalharSaldoInsuficiente(
  err: unknown,
  itens: Array<{ produtoId: number; quantidade: Prisma.Decimal | string }>,
) {
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

/**
 * Cria o pedido de saída:
 * - Se `forcarPendente` ou `input.pendente` for verdadeiro (ex.: enviado por SOLICITANTE),
 *   cria com status `PENDENTE` sem descontar do estoque, aguardando separação e baixa pelo Almoxarifado ou Supervisor.
 * - Caso contrário, cria já `CONCLUIDO` e gera uma movimentação SAIDA por item na mesma transação.
 */
export async function criar(input: CriarSaida, forcarPendente = false) {
  await garantirEstruturaSaida();
  const itens = [...input.itens].sort((a, b) => a.produtoId - b.produtoId);
  const criarPendente = forcarPendente || Boolean(input.pendente);

  try {
    return await prisma.$transaction(async (tx) => {
      const requisitante = await tx.requisitante.findUnique({ where: { id: input.requisitanteId } });
      if (!requisitante?.ativo) throw new AppError(422, 'REQUISITANTE_INVALIDO', 'Requisitante inexistente ou inativo');

      const ativos = await tx.produto.count({ where: { id: { in: itens.map((i) => i.produtoId) }, ativo: true } });
      if (ativos !== itens.length) {
        throw new AppError(422, 'PRODUTO_INVALIDO', 'Um ou mais produtos não existem ou estão inativos');
      }

      const pedido = await tx.pedidoSaida.create({
        data: {
          requisitanteId: input.requisitanteId,
          observacao: input.observacao,
          status: criarPendente ? 'PENDENTE' : 'CONCLUIDO',
          itens: {
            create: itens.map((i) => ({
              produtoId: i.produtoId,
              quantidade: i.quantidade,
              separado: !criarPendente,
              quantidadeSeparada: criarPendente ? '0' : i.quantidade,
            })),
          },
        },
        include: { itens: true },
      });

      if (!criarPendente) {
        for (const item of [...pedido.itens].sort((a, b) => a.produtoId - b.produtoId)) {
          await tx.movimentacao.create({
            data: { produtoId: item.produtoId, tipo: 'SAIDA', variacao: item.quantidade.neg(), itemSaidaId: item.id },
          });
        }
      }

      return tx.pedidoSaida.findUniqueOrThrow({ where: { id: pedido.id }, include: incluirDetalhe });
    });
  } catch (err) {
    throw await detalharSaldoInsuficiente(err, itens);
  }
}

/**
 * Atualiza a conferência de separação de uma solicitação PENDENTE (quais itens foram separados,
 * quantidades separadas e se os itens faltantes necessitam compra ou já estão a caminho).
 */
export async function atualizarSeparacao(id: number, body: SepararSaida) {
  await garantirEstruturaSaida();
  const pedido = await prisma.pedidoSaida.findUnique({
    where: { id },
    include: { itens: true },
  });
  if (!pedido) throw new AppError(404, 'NAO_ENCONTRADO', 'Solicitação de retirada não encontrada');
  if (pedido.status !== 'PENDENTE') {
    throw new AppError(409, 'STATUS_INVALIDO', 'Apenas solicitações pendentes podem ter a separação alterada');
  }

  const porId = new Map(pedido.itens.map((i) => [i.id, i]));
  for (const item of body.itens) {
    const atual = porId.get(item.itemId);
    if (!atual) {
      throw new AppError(422, 'ITEM_INVALIDO', `Item #${item.itemId} não pertence a esta solicitação de retirada`);
    }
    const qtdSep = new Prisma.Decimal(item.quantidadeSeparada);
    if (qtdSep.gt(atual.quantidade)) {
      throw new AppError(
        422,
        'QUANTIDADE_EXCEDE_SOLICITADO',
        `A quantidade separada (${qtdSep.toString()}) não pode ser maior que a solicitada (${atual.quantidade.toString()})`,
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    if (body.observacao !== undefined) {
      await tx.pedidoSaida.update({
        where: { id },
        data: { observacao: body.observacao },
      });
    }

    for (const item of body.itens) {
      const atual = porId.get(item.itemId)!;
      const qtdSep = new Prisma.Decimal(item.quantidadeSeparada);
      const temFalta = !item.separado || qtdSep.lt(atual.quantidade);
      await tx.itemPedidoSaida.update({
        where: { id: item.itemId },
        data: {
          separado: item.separado,
          quantidadeSeparada: qtdSep,
          situacaoFaltante: temFalta ? (item.situacaoFaltante ?? null) : null,
        },
      });
    }
  });

  return obter(id);
}

/**
 * Efetiva a baixa no estoque de uma solicitação de retirada PENDENTE (exclusivo para Almoxarifado e Supervisor).
 * Desconta apenas a quantidade efetivamente separada de cada item e preserva o status dos itens faltantes.
 */
export async function baixar(id: number, body?: BaixarSaida) {
  await garantirEstruturaSaida();
  if (body?.itens && body.itens.length > 0) {
    await atualizarSeparacao(id, { observacao: body.observacao, itens: body.itens });
  }

  const existente = await prisma.pedidoSaida.findUnique({
    where: { id },
    include: { itens: true },
  });
  if (!existente) throw new AppError(404, 'NAO_ENCONTRADO', 'Solicitação de retirada não encontrada');
  if (existente.status !== 'PENDENTE') {
    throw new AppError(409, 'STATUS_INVALIDO', 'Apenas solicitações pendentes podem ter baixa registrada no estoque');
  }

  // Se nenhum item teve separação preenchida ainda (ex.: baixa rápida sem editar), assume separação integral
  const algumPreenchido = existente.itens.some(
    (i) => i.separado || i.quantidadeSeparada.gt(0) || i.situacaoFaltante !== null,
  );

  const itensParaBaixa = [...existente.itens]
    .map((i) => {
      if (!algumPreenchido) {
        return {
          ...i,
          separado: true,
          quantidadeSeparada: i.quantidade,
          situacaoFaltante: null,
        };
      }
      return {
        ...i,
        quantidadeSeparada: i.separado ? i.quantidadeSeparada : new Prisma.Decimal(0),
      };
    })
    .sort((a, b) => a.produtoId - b.produtoId);

  const itensComSaida = itensParaBaixa.filter((i) => i.quantidadeSeparada.gt(0));
  if (itensComSaida.length === 0) {
    throw new AppError(
      422,
      'SEM_ITENS_SEPARADOS',
      'Marque ao menos um item separado com quantidade maior que zero para dar baixa no estoque, ou clique em "Salvar separação" para manter a solicitação aguardando os itens faltantes.',
    );
  }

  try {
    return await prisma.$transaction(async (tx) => {
      for (const item of itensParaBaixa) {
        await tx.itemPedidoSaida.update({
          where: { id: item.id },
          data: {
            separado: item.separado,
            quantidadeSeparada: item.quantidadeSeparada,
            situacaoFaltante: item.situacaoFaltante,
          },
        });
      }

      for (const item of itensComSaida) {
        await tx.movimentacao.create({
          data: {
            produtoId: item.produtoId,
            tipo: 'SAIDA',
            variacao: item.quantidadeSeparada.neg(),
            itemSaidaId: item.id,
          },
        });
      }

      return tx.pedidoSaida.update({
        where: { id },
        data: { status: 'CONCLUIDO' },
        include: incluirDetalhe,
      });
    });
  } catch (err) {
    throw await detalharSaldoInsuficiente(
      err,
      itensComSaida.map((i) => ({ produtoId: i.produtoId, quantidade: i.quantidadeSeparada })),
    );
  }
}

/** Cancela a solicitação (se PENDENTE) ou desfaz a retirada estornando cada item (se CONCLUIDO). */
export async function cancelar(id: number) {
  await garantirEstruturaSaida();
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

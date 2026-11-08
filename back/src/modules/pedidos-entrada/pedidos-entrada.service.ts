import { Prisma } from '../../generated/prisma/client';
import { prisma, type Tx } from '../../lib/prisma';
import { AppError } from '../../shared/AppError';
import { paginar, respostaPaginada } from '../../shared/pagination';
import { intervalo } from '../../shared/schemas';
import type {
  AtualizarEntrada,
  CriarEntrada,
  EnviarEntradaBody,
  LancarNfBody,
  ListarEntradas,
  ListarRecebimentos,
  ReceberBody,
  SubstituirItens,
} from './pedidos-entrada.schemas';

const incluirDetalhe = {
  fornecedor: { select: { id: true, nome: true, valorMinimoPedido: true } },
  itens: {
    include: { produto: { select: { id: true, codigo: true, nome: true, unidade: true, marca: true } } },
    orderBy: { id: 'asc' },
  },
  recebimentos: {
    include: {
      itens: {
        include: {
          itemPedido: {
            include: { produto: { select: { id: true, codigo: true, nome: true, unidade: true } } },
          },
        },
        orderBy: { id: 'asc' },
      },
    },
    orderBy: { dataRecebimento: 'desc' },
  },
} satisfies Prisma.PedidoEntradaInclude;

let estruturaInicializada = false;

/**
 * Garante de forma idempotente que a coluna `numero_oc` e as tabelas de recebimento/NF existam
 * mesmo que o banco já estivesse rodando antes da migração.
 */
export async function garantirEstruturaRecebimento() {
  if (estruturaInicializada) return;
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "pedidos_entrada" ADD COLUMN IF NOT EXISTS "numero_oc" VARCHAR(40);
      CREATE UNIQUE INDEX IF NOT EXISTS "pedidos_entrada_numero_oc_key" ON "pedidos_entrada"("numero_oc");
      UPDATE "pedidos_entrada"
         SET "numero_oc" = 'OC-' || LPAD("id"::text, 4, '0')
       WHERE "numero_oc" IS NULL
         AND "status" IN ('ENVIADO', 'RECEBIDO_PARCIAL', 'RECEBIDO');

      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_recebimento') THEN
          CREATE TYPE "status_recebimento" AS ENUM ('AGUARDANDO_NF', 'CONCLUIDO');
        END IF;
      END $$;

      CREATE TABLE IF NOT EXISTS "recebimentos_entrada" (
        "id" SERIAL PRIMARY KEY,
        "pedido_id" INTEGER NOT NULL REFERENCES "pedidos_entrada"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        "status" "status_recebimento" NOT NULL DEFAULT 'AGUARDANDO_NF',
        "numero_nf" VARCHAR(60),
        "observacao" TEXT,
        "recebido_por_nome" VARCHAR(120),
        "nf_lancada_por_nome" VARCHAR(120),
        "data_recebimento" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "data_nf" TIMESTAMPTZ(6)
      );

      CREATE TABLE IF NOT EXISTS "itens_recebimento_entrada" (
        "id" SERIAL PRIMARY KEY,
        "recebimento_id" INTEGER NOT NULL REFERENCES "recebimentos_entrada"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        "item_pedido_id" INTEGER NOT NULL REFERENCES "itens_pedido_entrada"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        "produto_id" INTEGER NOT NULL,
        "quantidade" DECIMAL(12,3) NOT NULL,
        CONSTRAINT "itens_recebimento_entrada_recebimento_id_item_pedido_id_key" UNIQUE ("recebimento_id", "item_pedido_id")
      );
    `);
    estruturaInicializada = true;
  } catch {
    estruturaInicializada = true;
  }
}

// ---------------------------------------------------------------- helpers

async function carregar(tx: Tx, id: number) {
  const pedido = await tx.pedidoEntrada.findUnique({
    where: { id },
    include: {
      itens: true,
      recebimentos: { include: { itens: true } },
    },
  });
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
 * Recalcula o status a partir das quantidades efetivamente recebidas (com NF lançada).
 * Usado após o lançamento da NF e também no estorno de um recebimento.
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
  await garantirEstruturaRecebimento();
  const periodo = intervalo(q.de, q.ate);
  const where: Prisma.PedidoEntradaWhereInput = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.fornecedorId ? { fornecedorId: q.fornecedorId } : {}),
    ...(periodo ? { dataPedido: periodo } : {}),
  };
  const [data, total] = await Promise.all([
    prisma.pedidoEntrada.findMany({
      where,
      include: {
        ...incluirDetalhe,
        _count: { select: { itens: true } },
      },
      orderBy: { dataPedido: 'desc' },
      ...paginar(q),
    }),
    prisma.pedidoEntrada.count({ where }),
  ]);
  return respostaPaginada(data, total, q);
}

export async function obter(id: number) {
  await garantirEstruturaRecebimento();
  const pedido = await prisma.pedidoEntrada.findUnique({ where: { id }, include: incluirDetalhe });
  if (!pedido) throw new AppError(404, 'NAO_ENCONTRADO', 'Pedido de entrada não encontrado');
  return pedido;
}

export async function listarRecebimentos(q: ListarRecebimentos) {
  await garantirEstruturaRecebimento();
  const data = await prisma.recebimentoEntrada.findMany({
    where: {
      ...(q.status ? { status: q.status } : {}),
      ...(q.pedidoId ? { pedidoId: q.pedidoId } : {}),
    },
    include: {
      pedido: {
        select: {
          id: true,
          numeroOc: true,
          status: true,
          fornecedor: { select: { id: true, nome: true } },
        },
      },
      itens: {
        include: {
          itemPedido: {
            include: {
              produto: { select: { id: true, codigo: true, nome: true, unidade: true } },
            },
          },
        },
        orderBy: { id: 'asc' },
      },
    },
    orderBy: { dataRecebimento: 'desc' },
  });
  return { data };
}

// ---------------------------------------------------------------- rascunho

export async function criar(input: CriarEntrada) {
  await garantirEstruturaRecebimento();
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

export async function atualizarCabecalho(id: number, input: AtualizarEntrada) {
  await garantirEstruturaRecebimento();
  return prisma.$transaction(async (tx) => {
    exigirStatus(await carregar(tx, id), ['RASCUNHO'], 'editar');
    await validarReferencias(tx, input.fornecedorId, []);
    return tx.pedidoEntrada.update({ where: { id }, data: input, include: incluirDetalhe });
  });
}

/** Troca a lista inteira de itens (só em RASCUNHO). */
export async function substituirItens(id: number, input: SubstituirItens) {
  await garantirEstruturaRecebimento();
  return prisma.$transaction(async (tx) => {
    exigirStatus(await carregar(tx, id), ['RASCUNHO'], 'editar os itens de');
    await validarReferencias(tx, undefined, input.itens.map((i) => i.produtoId));
    await tx.itemPedidoEntrada.deleteMany({ where: { pedidoId: id } });
    await tx.itemPedidoEntrada.createMany({ data: input.itens.map((i) => ({ pedidoId: id, ...i })) });
    return tx.pedidoEntrada.findUniqueOrThrow({ where: { id }, include: incluirDetalhe });
  });
}

export async function excluir(id: number) {
  await garantirEstruturaRecebimento();
  return prisma.$transaction(async (tx) => {
    exigirStatus(await carregar(tx, id), ['RASCUNHO'], 'excluir');
    await tx.pedidoEntrada.delete({ where: { id } }); // itens saem por cascade
  });
}

// ---------------------------------------------------------------- transições

/**
 * Aprova a solicitação do almoxarifado, gera a OC (Ordem de Compra) e envia ao fornecedor.
 */
export async function enviar(id: number, body?: EnviarEntradaBody) {
  await garantirEstruturaRecebimento();
  return prisma.$transaction(async (tx) => {
    const pedido = await carregar(tx, id);
    exigirStatus(pedido, ['RASCUNHO'], 'enviar');
    if (pedido.itens.length === 0) throw new AppError(422, 'PEDIDO_SEM_ITENS', 'O pedido não tem itens');

    // Gera automaticamente o código da OC caso o setor de compras não tenha digitado um personalizado
    const numeroOc = body?.numeroOc?.trim() || pedido.numeroOc || `OC-${String(id).padStart(4, '0')}`;

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
      data: { status: 'ENVIADO', numeroOc, previsaoEntrega },
      include: incluirDetalhe,
    });
  });
}

/**
 * Etapa 1 do Recebimento (Almoxarifado):
 * Registra a chegada física (total ou parcial) dos materiais de uma OC.
 * Os materiais ficam em AGUARDANDO_NF e SÓ entram no saldo do estoque quando o Compras lançar a NF.
 */
export async function receber(id: number, input: ReceberBody, recebidoPorNome?: string) {
  await garantirEstruturaRecebimento();
  return prisma.$transaction(async (tx) => {
    const pedido = await carregar(tx, id);
    exigirStatus(pedido, ['ENVIADO', 'RECEBIDO_PARCIAL'], 'registrar recebimento de');

    // Soma quanto de cada item já está aguardando NF em recebimentos anteriores
    const aguardandoPorItem = new Map<number, Prisma.Decimal>();
    for (const rec of pedido.recebimentos) {
      if (rec.status === 'AGUARDANDO_NF') {
        for (const ri of rec.itens) {
          const atual = aguardandoPorItem.get(ri.itemPedidoId) ?? new Prisma.Decimal(0);
          aguardandoPorItem.set(ri.itemPedidoId, atual.plus(ri.quantidade));
        }
      }
    }

    const linhas = input.itens.map((r) => {
      const item = pedido.itens.find((i) => i.id === r.itemId);
      if (!item) throw new AppError(422, 'ITEM_INVALIDO', `O item ${r.itemId} não pertence a esta Ordem de Compra`);
      const quantidade = new Prisma.Decimal(r.quantidade);
      const jaAguardando = aguardandoPorItem.get(item.id) ?? new Prisma.Decimal(0);

      if (item.quantidadeRecebida.plus(jaAguardando).plus(quantidade).gt(item.quantidade)) {
        throw new AppError(
          422,
          'EXCEDE_PEDIDO',
          `A quantidade informada excede o saldo pendente da OC (produto ${item.produtoId})`,
        );
      }
      return { item, quantidade };
    });

    await tx.recebimentoEntrada.create({
      data: {
        pedidoId: pedido.id,
        status: 'AGUARDANDO_NF',
        observacao: input.observacao ?? null,
        recebidoPorNome: recebidoPorNome ?? null,
        itens: {
          create: linhas.map(({ item, quantidade }) => ({
            itemPedidoId: item.id,
            produtoId: item.produtoId,
            quantidade,
          })),
        },
      },
    });

    return tx.pedidoEntrada.findUniqueOrThrow({ where: { id }, include: incluirDetalhe });
  });
}

/**
 * Etapa 2 do Recebimento (Setor de Compras / Supervisor):
 * Vincula a Nota Fiscal (NF) ao recebimento conferido pelo Almoxarifado e libera a entrada no estoque.
 */
export async function lancarNfRecebimento(recebimentoId: number, input: LancarNfBody, nfLancadaPorNome?: string) {
  await garantirEstruturaRecebimento();
  return prisma.$transaction(async (tx) => {
    const rec = await tx.recebimentoEntrada.findUnique({
      where: { id: recebimentoId },
      include: { itens: true, pedido: true },
    });
    if (!rec) throw new AppError(404, 'NAO_ENCONTRADO', 'Registro de recebimento não encontrado');
    if (rec.status !== 'AGUARDANDO_NF') {
      throw new AppError(409, 'STATUS_INVALIDO', 'A Nota Fiscal deste recebimento já foi lançada');
    }

    const pedido = await carregar(tx, rec.pedidoId);
    const numeroOc = pedido.numeroOc ?? `OC-${String(pedido.id).padStart(4, '0')}`;

    // Ordem fixa por produtoId: evita deadlock na trigger de saldo
    const linhas = [...rec.itens].sort((a, b) => a.produtoId - b.produtoId);

    for (const linha of linhas) {
      const itemPedido = pedido.itens.find((i) => i.id === linha.itemPedidoId);
      if (!itemPedido) {
        throw new AppError(422, 'ITEM_INVALIDO', `Item ${linha.itemPedidoId} não encontrado no pedido`);
      }
      if (itemPedido.quantidadeRecebida.plus(linha.quantidade).gt(itemPedido.quantidade)) {
        throw new AppError(422, 'EXCEDE_PEDIDO', `Recebimento maior que o pedido (produto ${linha.produtoId})`);
      }

      await tx.itemPedidoEntrada.update({
        where: { id: itemPedido.id },
        data: { quantidadeRecebida: { increment: linha.quantidade } },
      });

      await tx.movimentacao.create({
        data: {
          produtoId: linha.produtoId,
          tipo: 'ENTRADA',
          variacao: linha.quantidade,
          itemEntradaId: itemPedido.id,
          observacao: `Entrada ${numeroOc} · NF ${input.numeroNf}`,
        },
      });
    }

    await tx.recebimentoEntrada.update({
      where: { id: recebimentoId },
      data: {
        status: 'CONCLUIDO',
        numeroNf: input.numeroNf,
        nfLancadaPorNome: nfLancadaPorNome ?? null,
        dataNf: new Date(),
      },
    });

    return recalcularStatus(tx, rec.pedidoId);
  });
}

/** Cancelar NÃO reverte o que já foi recebido; para isso, estorne as movimentações. */
export async function cancelar(id: number) {
  await garantirEstruturaRecebimento();
  return prisma.$transaction(async (tx) => {
    exigirStatus(await carregar(tx, id), ['RASCUNHO', 'ENVIADO', 'RECEBIDO_PARCIAL'], 'cancelar');
    return tx.pedidoEntrada.update({ where: { id }, data: { status: 'CANCELADO' }, include: incluirDetalhe });
  });
}

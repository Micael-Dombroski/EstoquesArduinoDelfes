import { prisma } from "../../lib/prisma";
import { garantirEstruturaRecebimento } from "../pedidos-entrada/pedidos-entrada.service";
import { BANCO_POR_TELA, TELA_POR_BANCO, type Consulta } from "./acompanhamento.schemas";

// Datas chegam como AAAA-MM-DD. Servidor e navegador rodam na mesma máquina (mesmo fuso).
const inicioDoDia = (d: string) => new Date(`${d}T00:00:00`);
const fimDoDia = (d: string) => new Date(`${d}T23:59:59.999`);
const dataUtc = (d: string) => new Date(`${d}T00:00:00.000Z`); // colunas @db.Date

function hojeUtc(): Date {
  const agora = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return dataUtc(`${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}`);
}

export async function listarEntradas(q: Consulta) {
  await garantirEstruturaRecebimento();
  const filtros: Record<string, unknown>[] = [];

  // Período em que o pedido foi feito
  if (q.pedidoDe && q.pedidoAte) {
    filtros.push({ dataPedido: { gte: inicioDoDia(q.pedidoDe), lte: fimDoDia(q.pedidoAte) } });
  }

  // "Serão ou foram entregues no período": se já chegou, vale a data real do recebimento;
  // se não, vale a previsão. Cada ramo usa um índice próprio.
  if (q.entregaDe && q.entregaAte) {
    filtros.push({
      OR: [
        { dataRecebimento: { gte: inicioDoDia(q.entregaDe), lte: fimDoDia(q.entregaAte) } },
        { dataRecebimento: null, previsaoEntrega: { gte: dataUtc(q.entregaDe), lte: dataUtc(q.entregaAte) } },
      ],
    });
  }

  if (q.status) filtros.push({ status: { in: BANCO_POR_TELA[q.status] } });
  if (q.solicitanteId) filtros.push({ solicitanteId: q.solicitanteId });
  if (q.atrasados === "true") {
    filtros.push({
      status: { notIn: ["RECEBIDO", "RECUSADO", "CANCELADO"] },
      previsaoEntrega: { lt: hojeUtc() },
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = filtros.length ? { AND: filtros } : {};

  // Uma consulta para o total e outra para a página (com itens: sem N+1).
  const [total, linhas] = await prisma.$transaction([
    prisma.pedidoEntrada.count({ where }),
    prisma.pedidoEntrada.findMany({
      where,
      orderBy: [{ dataPedido: "desc" }, { id: "desc" }],
      skip: (q.pagina - 1) * q.limite,
      take: q.limite,
      include: {
        fornecedor: { select: { id: true, nome: true, valorMinimoPedido: true } },
        solicitante: { select: { id: true, nome: true } },
        recebimentos: { where: { status: "AGUARDANDO_NF" }, select: { id: true } },
        itens: {
          orderBy: { id: "asc" },
          select: {
            id: true,
            produtoId: true,
            quantidade: true,
            quantidadeRecebida: true,
            precoUnitario: true,
            marca: true,
            produto: { select: { codigo: true, nome: true, unidade: true, marca: true } },
          },
        },
      },
    }),
  ]);

  return {
    data: linhas.map((p) => ({
      id: p.id,
      numeroOc: p.numeroOc,
      status: TELA_POR_BANCO[p.status] ?? "pendente",
      statusBanco: p.status,
      fornecedor: p.fornecedor
        ? {
            id: p.fornecedor.id,
            nome: p.fornecedor.nome,
            valorMinimoPedido: p.fornecedor.valorMinimoPedido?.toString() ?? null,
          }
        : null,
      solicitante: p.solicitante,
      dataPedido: p.dataPedido.toISOString(),
      previsaoEntrega: p.previsaoEntrega ? p.previsaoEntrega.toISOString().slice(0, 10) : null,
      dataRecebimento: p.dataRecebimento ? p.dataRecebimento.toISOString() : null,
      observacao: p.observacao,
      recebimentosPendentesNf: p.recebimentos.length,
      itens: p.itens.map((i) => ({
        id: i.id,
        produtoId: i.produtoId,
        codigo: i.produto.codigo,
        nome: i.produto.nome,
        unidade: i.produto.unidade,
        marca: i.marca ?? i.produto.marca ?? null,
        quantidade: i.quantidade.toString(),
        quantidadeRecebida: i.quantidadeRecebida.toString(),
        precoUnitario: i.precoUnitario?.toString() ?? null,
      })),
    })),
    meta: { total, pagina: q.pagina, limite: q.limite },
  };
}

import { prisma } from "../../lib/prisma";
import { BANCO_POR_TELA, TELA_POR_BANCO, type Consulta } from "./acompanhamento.schemas";

// Datas chegam como AAAA-MM-DD. Servidor e navegador rodam na mesma máquina (mesmo fuso).
const inicioDoDia = (d: string) => new Date(`${d}T00:00:00`);
const fimDoDia = (d: string) => new Date(`${d}T23:59:59.999`);
const dataUtc = (d: string) => new Date(`${d}T00:00:00.000Z`); // colunas @db.Date

export async function listarEntradas(q: Consulta) {
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
        fornecedor: { select: { id: true, nome: true } },
        solicitante: { select: { id: true, nome: true } },
        itens: {
          orderBy: { id: "asc" },
          select: {
            id: true,
            produtoId: true,
            quantidade: true,
            quantidadeRecebida: true,
            produto: { select: { nome: true, unidade: true } },
          },
        },
      },
    }),
  ]);

  return {
    data: linhas.map((p) => ({
      id: p.id,
      status: TELA_POR_BANCO[p.status] ?? "pendente",
      statusBanco: p.status,
      fornecedor: p.fornecedor,
      solicitante: p.solicitante,
      dataPedido: p.dataPedido.toISOString(),
      previsaoEntrega: p.previsaoEntrega ? p.previsaoEntrega.toISOString().slice(0, 10) : null,
      dataRecebimento: p.dataRecebimento ? p.dataRecebimento.toISOString() : null,
      observacao: p.observacao,
      itens: p.itens.map((i) => ({
        id: i.id,
        produtoId: i.produtoId,
        nome: i.produto.nome,
        unidade: i.produto.unidade,
        quantidade: i.quantidade.toString(),
        quantidadeRecebida: i.quantidadeRecebida.toString(),
      })),
    })),
    meta: { total, pagina: q.pagina, limite: q.limite },
  };
}

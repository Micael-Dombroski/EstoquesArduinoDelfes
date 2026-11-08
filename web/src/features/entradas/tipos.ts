// Contrato de GET /api/v1/acompanhamento/entradas e regras de apresentação.

import type { StatusPedidoEntrada as StatusEntradaBanco } from "@/lib/types";

export type StatusEntrada = "pendente" | "aprovado" | "recusado" | "a_caminho" | "recebido" | "cancelado";

export type ItemPedidoEntradaAcomp = {
  id: number;
  produtoId: number;
  codigo?: string;
  nome: string;
  unidade: string;
  marca?: string | null;
  quantidade: string;
  quantidadeRecebida: string;
  precoUnitario?: string | null;
};

export type PedidoEntradaAcomp = {
  id: number;
  numeroOc?: string | null;
  status: StatusEntrada;
  statusBanco?: StatusEntradaBanco;
  fornecedor: { id: number; nome: string; valorMinimoPedido?: string | null } | null;
  solicitante: { id: number; nome: string } | null;
  dataPedido: string; // ISO
  previsaoEntrega: string | null; // AAAA-MM-DD
  dataRecebimento: string | null; // ISO
  observacao: string | null;
  recebimentosPendentesNf?: number;
  itens: ItemPedidoEntradaAcomp[];
};

export type FiltrosEntradas = {
  pedidoDe: string;
  pedidoAte: string;
  entregaDe: string;
  entregaAte: string;
  status: string;
  solicitanteId: string;
  atrasados: string;
};

export const STATUS: Record<StatusEntrada, { rotulo: string; classe: string }> = {
  pendente: {
    rotulo: "Aguardando revisão",
    classe: "bg-amber-100 text-amber-900 dark:bg-amber-950/70 dark:text-amber-300",
  },
  aprovado: {
    rotulo: "Aprovado",
    classe: "bg-blue-100 text-blue-900 dark:bg-blue-950/70 dark:text-blue-300",
  },
  recusado: {
    rotulo: "Recusado",
    classe: "bg-red-100 text-red-800 dark:bg-red-950/70 dark:text-red-300",
  },
  a_caminho: {
    rotulo: "OC emitida · A caminho",
    classe: "bg-indigo-100 text-indigo-900 dark:bg-indigo-950/70 dark:text-indigo-300",
  },
  recebido: {
    rotulo: "Recebido",
    classe: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300",
  },
  cancelado: {
    rotulo: "Cancelado",
    classe: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  },
};

// "2026-11-12" (ou ISO) -> "12/11/2026"
export function fmtData(valor: string): string {
  const [a, m, d] = valor.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

export const fmtDiaLocal = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

// Dias de hoje até a data (AAAA-MM-DD), no calendário local. Negativo = já passou.
export function diasAte(dia: string): number {
  const [a, m, d] = dia.slice(0, 10).split("-").map(Number);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((new Date(a, m - 1, d).getTime() - hoje.getTime()) / 86_400_000);
}

// Linha de prazo exibida em cada pedido.
export function prazo(p: PedidoEntradaAcomp): { texto: string; atrasado: boolean } | null {
  if (p.status === "recebido") {
    return p.dataRecebimento ? { texto: `Recebido em ${fmtDiaLocal(p.dataRecebimento)}`, atrasado: false } : null;
  }
  if (p.status === "recusado" || p.status === "cancelado") return null;
  if (!p.previsaoEntrega) return { texto: "Sem previsão de entrega", atrasado: false };

  const d = diasAte(p.previsaoEntrega);
  const data = fmtData(p.previsaoEntrega);
  if (d > 1) return { texto: `Previsão ${data} · faltam ${d} dias`, atrasado: false };
  if (d === 1) return { texto: `Previsão ${data} · chega amanhã`, atrasado: false };
  if (d === 0) return { texto: `Previsão ${data} · chega hoje`, atrasado: false };
  return { texto: `Previsão ${data} · atrasado há ${-d} ${d === -1 ? "dia" : "dias"}`, atrasado: true };
}

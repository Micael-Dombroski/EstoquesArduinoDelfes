"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { podeRevisarCompra, podeSolicitarCompra, useSessao } from "@/lib/auth";
import { mensagemDeErro } from "@/lib/errors";
import { codigoOc, fmt, fmtDataHora } from "@/lib/format";
import { usePedidosEntrada } from "@/lib/hooks";
import type { PedidoEntrada, StatusPedidoEntrada } from "@/lib/types";

const ABAS: Array<{ status?: StatusPedidoEntrada; rotulo: string }> = [
  { status: "RASCUNHO", rotulo: "Aguardando revisão" },
  { status: "ENVIADO", rotulo: "OC gerada / A caminho" },
  { status: "RECEBIDO_PARCIAL", rotulo: "Recebidos parcial" },
  { status: "RECEBIDO", rotulo: "Recebidos" },
  { status: "CANCELADO", rotulo: "Cancelados" },
  { status: undefined, rotulo: "Todos" },
];

const BADGE_STATUS: Record<StatusPedidoEntrada, { texto: string; classe: string }> = {
  RASCUNHO: {
    texto: "Solicitação · Aguardando revisão",
    classe: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  },
  APROVADO: {
    texto: "Aprovado · Aguardando envio",
    classe: "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300",
  },
  RECUSADO: {
    texto: "Recusado",
    classe: "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300",
  },
  ENVIADO: {
    texto: "OC emitida · A caminho",
    classe: "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300",
  },
  RECEBIDO_PARCIAL: {
    texto: "Recebido parcialmente",
    classe: "bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300",
  },
  RECEBIDO: {
    texto: "Recebido no estoque (com NF)",
    classe: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  },
  CANCELADO: {
    texto: "Rejeitado / Cancelado",
    classe: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  },
};

function fmtMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type EdicaoItem = { quantidade: string; precoUnitario: string };

export function PedidosCompra() {
  const qc = useQueryClient();
  const { usuario } = useSessao();
  const [abaStatus, setAbaStatus] = useState<StatusPedidoEntrada | undefined>("RASCUNHO");
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [itensEditados, setItensEditados] = useState<Record<number, EdicaoItem>>({});
  const [obsEditada, setObsEditada] = useState("");
  const [ocCustomizada, setOcCustomizada] = useState<Record<number, string>>({});

  const { data: pedidos = [], isLoading, isError, error } = usePedidosEntrada(abaStatus);

  const revisarPermitido = podeRevisarCompra(usuario?.perfil);
  const solicitarPermitido = podeSolicitarCompra(usuario?.perfil);

  function iniciarEdicao(p: PedidoEntrada) {
    const mapa: Record<number, EdicaoItem> = {};
    for (const item of p.itens ?? []) {
      mapa[item.produtoId] = {
        quantidade: String(Number(item.quantidade)),
        precoUnitario: item.precoUnitario != null ? String(Number(item.precoUnitario)) : "",
      };
    }
    setItensEditados(mapa);
    setObsEditada(p.observacao ?? "");
    setEditandoId(p.id);
  }

  const salvarRevisao = useMutation({
    mutationFn: async (p: PedidoEntrada) => {
      const itensOriginais = p.itens ?? [];
      await api(`/pedidos-entrada/${p.id}/itens`, {
        method: "PUT",
        body: JSON.stringify({
          itens: itensOriginais.map((i) => {
            const ed = itensEditados[i.produtoId];
            return {
              produtoId: i.produtoId,
              quantidade: ed?.quantidade || i.quantidade,
              marca: i.marca ?? null,
              precoUnitario: ed?.precoUnitario ? ed.precoUnitario : null,
            };
          }),
        }),
      });
      if (obsEditada !== (p.observacao ?? "")) {
        await api(`/pedidos-entrada/${p.id}`, {
          method: "PATCH",
          body: JSON.stringify({ observacao: obsEditada || null }),
        });
      }
    },
    onSuccess: () => {
      setEditandoId(null);
      qc.invalidateQueries();
      toast.success("Solicitação de compra atualizada com sucesso.");
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const aprovarPedido = useMutation({
    mutationFn: ({ id, numeroOc }: { id: number; numeroOc?: string }) =>
      api(`/pedidos-entrada/${id}/enviar`, {
        method: "POST",
        body: JSON.stringify(numeroOc?.trim() ? { numeroOc: numeroOc.trim() } : {}),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries();
      const ocGerada = vars.numeroOc?.trim() || `OC-${String(vars.id).padStart(4, "0")}`;
      toast.success(`Solicitação aprovada! Ordem de Compra ${ocGerada} gerada e enviada ao fornecedor.`);
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const cancelarPedido = useMutation({
    mutationFn: (id: number) => api(`/pedidos-entrada/${id}/cancelar`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Solicitação rejeitada/cancelada.");
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  return (
    <div className="space-y-6">
      {/* Abas de filtro por status */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
        {ABAS.map((aba) => {
          const ativa = abaStatus === aba.status;
          return (
            <button
              key={aba.rotulo}
              type="button"
              onClick={() => setAbaStatus(aba.status)}
              className={`h-10 rounded-lg px-3.5 text-sm font-medium transition-colors ${
                ativa
                  ? "bg-blue-700 text-white dark:bg-blue-600"
                  : "bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
              }`}
            >
              {aba.rotulo}
            </button>
          );
        })}
      </div>

      {isLoading && <div className="h-40 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />}
      {isError && <p className="text-red-700 dark:text-red-400">{mensagemDeErro(error)}</p>}

      {!isLoading && !isError && pedidos.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-600 dark:border-slate-700 dark:text-slate-400">
          Nenhum pedido de compra encontrado nesta aba.
        </p>
      )}

      <div className="space-y-4">
        {pedidos.map((p) => {
          const badge = BADGE_STATUS[p.status];
          const itens = p.itens ?? [];
          const emEdicao = editandoId === p.id;
          const ocPadrao = `OC-${String(p.id).padStart(4, "0")}`;
          const recebimentosPendentesNf = (p.recebimentos ?? []).filter((r) => r.status === "AGUARDANDO_NF").length;

          const totalEstimado = itens.reduce((acc, i) => {
            const qtd = emEdicao
              ? Number(itensEditados[i.produtoId]?.quantidade ?? i.quantidade)
              : Number(i.quantidade);
            const preco = emEdicao
              ? Number(itensEditados[i.produtoId]?.precoUnitario ?? i.precoUnitario ?? 0)
              : Number(i.precoUnitario ?? 0);
            return acc + (Number.isFinite(qtd * preco) ? qtd * preco : 0);
          }, 0);

          const minimoFornecedor = p.fornecedor?.valorMinimoPedido ? Number(p.fornecedor.valorMinimoPedido) : null;
          const abaixoDoMinimo = minimoFornecedor !== null && totalEstimado > 0 && totalEstimado < minimoFornecedor;

          return (
            <section
              key={p.id}
              className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
            >
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-800">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    {p.status !== "RASCUNHO" && (
                      <span className="rounded-md bg-blue-100 px-2 py-0.5 font-mono text-xs font-semibold text-blue-800 dark:bg-blue-950/80 dark:text-blue-300">
                        {codigoOc(p)}
                      </span>
                    )}
                    <h2 className="font-semibold">
                      Solicitação #{p.id} · {p.fornecedor?.nome ?? `Fornecedor ${p.fornecedorId}`}
                    </h2>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.classe}`}>
                      {badge.texto}
                    </span>
                    {recebimentosPendentesNf > 0 && (
                      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/80 dark:text-amber-300">
                        {recebimentosPendentesNf} chegada(s) aguardando NF
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Criado em {fmtDataHora(p.dataPedido)}
                    {p.observacao ? ` · ${p.observacao}` : ""}
                  </p>
                </div>

                <div className="text-right text-sm">
                  <p className="font-semibold tabular-nums">{fmtMoeda(totalEstimado)}</p>
                  {minimoFornecedor !== null && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Mínimo do fornecedor: {fmtMoeda(minimoFornecedor)}
                    </p>
                  )}
                </div>
              </header>

              {abaixoDoMinimo && p.status === "RASCUNHO" && (
                <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                  Atenção: o valor estimado ({fmtMoeda(totalEstimado)}) está abaixo do pedido mínimo exigido pelo
                  fornecedor ({fmtMoeda(minimoFornecedor!)}).
                </div>
              )}

              {/* Lista de itens da solicitação */}
              <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                {itens.map((i) => {
                  const un = i.produto?.unidade ?? "un";
                  const ed = itensEditados[i.produtoId];
                  return (
                    <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{i.produto?.nome ?? `Produto ${i.produtoId}`}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Código: {i.produto?.codigo ?? i.produtoId}
                          {Number(i.quantidadeRecebida) > 0 &&
                            ` · Já no estoque (com NF): ${fmt(i.quantidadeRecebida)} de ${fmt(i.quantidade)} ${un}`}
                        </p>
                      </div>

                      {emEdicao ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="flex items-center gap-1.5 text-xs">
                            <span>Qtd ({un}):</span>
                            <input
                              inputMode="decimal"
                              value={ed?.quantidade ?? ""}
                              onChange={(e) =>
                                setItensEditados((prev) => ({
                                  ...prev,
                                  [i.produtoId]: { ...prev[i.produtoId], quantidade: e.target.value },
                                }))
                              }
                              className="h-9 w-20 rounded-md border border-slate-300 bg-white px-2 text-right tabular-nums dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                            />
                          </label>
                          <label className="flex items-center gap-1.5 text-xs">
                            <span>R$ unit.:</span>
                            <input
                              inputMode="decimal"
                              value={ed?.precoUnitario ?? ""}
                              onChange={(e) =>
                                setItensEditados((prev) => ({
                                  ...prev,
                                  [i.produtoId]: { ...prev[i.produtoId], precoUnitario: e.target.value },
                                }))
                              }
                              className="h-9 w-24 rounded-md border border-slate-300 bg-white px-2 text-right tabular-nums dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                            />
                          </label>
                        </div>
                      ) : (
                        <div className="text-right tabular-nums">
                          <p className="font-medium">
                            {fmt(i.quantidade)} {un}
                          </p>
                          {i.precoUnitario != null && (
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {fmtMoeda(Number(i.precoUnitario))} / {un}
                            </p>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>

              {emEdicao && (
                <div className="border-t border-slate-200 p-4 dark:border-slate-800">
                  <label htmlFor={`obs-${p.id}`} className="mb-1 block text-xs font-medium">
                    Observação da revisão (Compras / Supervisor)
                  </label>
                  <input
                    id={`obs-${p.id}`}
                    value={obsEditada}
                    onChange={(e) => setObsEditada(e.target.value)}
                    placeholder="Ex.: Quantidade revisada pelo setor de compras"
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              )}

              {/* Ações de acordo com o status e o perfil do usuário */}
              {p.status === "RASCUNHO" && (
                <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                  {emEdicao ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={salvarRevisao.isPending}
                        onClick={() => salvarRevisao.mutate(p)}
                        className="h-10 rounded-lg bg-blue-700 px-4 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60 dark:bg-blue-600 dark:hover:bg-blue-500"
                      >
                        {salvarRevisao.isPending ? "Salvando..." : "Salvar revisão"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditandoId(null)}
                        className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                      >
                        Cancelar edição
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        {solicitarPermitido && (
                          <button
                            type="button"
                            onClick={() => iniciarEdicao(p)}
                            className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                          >
                            Revisar quantidades / preços
                          </button>
                        )}
                      </div>

                      {revisarPermitido ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="flex items-center gap-1.5 text-xs">
                            <span className="text-slate-600 dark:text-slate-400">Nº da OC:</span>
                            <input
                              value={ocCustomizada[p.id] ?? ocPadrao}
                              onChange={(e) => setOcCustomizada((prev) => ({ ...prev, [p.id]: e.target.value }))}
                              className="h-10 w-28 rounded-lg border border-slate-300 bg-white px-2.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                            />
                          </label>
                          <button
                            type="button"
                            disabled={cancelarPedido.isPending}
                            onClick={() => cancelarPedido.mutate(p.id)}
                            className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-red-400 dark:hover:bg-red-950/40"
                          >
                            Rejeitar
                          </button>
                          <button
                            type="button"
                            disabled={aprovarPedido.isPending}
                            onClick={() =>
                              aprovarPedido.mutate({ id: p.id, numeroOc: ocCustomizada[p.id] ?? ocPadrao })
                            }
                            className="h-10 rounded-lg bg-emerald-700 px-4 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                          >
                            {aprovarPedido.isPending ? "Gerando OC..." : "Aprovar e gerar OC"}
                          </button>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                          Aguardando o <strong>Setor de Compras</strong> ou <strong>Supervisor</strong> revisar e emitir
                          a OC.
                        </p>
                      )}
                    </>
                  )}
                </footer>
              )}

              {(p.status === "ENVIADO" || p.status === "RECEBIDO_PARCIAL") && (
                <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Ordem de Compra <strong>{codigoOc(p)}</strong> ativa. O almoxarifado registra a chegada dos itens e
                    o compras informa a NF na tela de recebimento.
                  </p>
                  <Link
                    href="/recebimento"
                    className="inline-flex h-10 items-center rounded-lg bg-blue-700 px-4 text-sm font-medium text-white hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500"
                  >
                    Ir para Recebimento (OC / NF)
                  </Link>
                </footer>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

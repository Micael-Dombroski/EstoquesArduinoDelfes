"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { podeReceberCompra, podeRevisarCompra, useSessao } from "@/lib/auth";
import { mensagemDeErro } from "@/lib/errors";
import { codigoOc, fmt, fmtDataHora, normaliza } from "@/lib/format";
import { usePedidosEntrada, useRecebimentos } from "@/lib/hooks";
import type { ItemPedidoEntrada, PedidoEntrada, StatusRecebimento } from "@/lib/types";

function qtdAguardandoNfDoItem(pedido: PedidoEntrada, itemId: number): number {
  let soma = 0;
  for (const rec of pedido.recebimentos ?? []) {
    if (rec.status === "AGUARDANDO_NF") {
      for (const ri of rec.itens ?? []) {
        if (ri.itemPedidoId === itemId) {
          soma += Number(ri.quantidade);
        }
      }
    }
  }
  return soma;
}

export function RecebimentoMateriais() {
  const qc = useQueryClient();
  const { usuario } = useSessao();

  const { data: todosPedidos = [], isLoading: carregandoPedidos } = usePedidosEntrada();
  const [abaRecebimentos, setAbaRecebimentos] = useState<StatusRecebimento>("AGUARDANDO_NF");
  const { data: recebimentos = [], isLoading: carregandoRecebimentos } = useRecebimentos(abaRecebimentos);

  const [buscaOc, setBuscaOc] = useState("");
  const [pedidoSelecionadoId, setPedidoSelecionadoId] = useState<number | null>(null);
  const [marcados, setMarcados] = useState<Record<number, boolean>>({});
  const [quantidades, setQuantidades] = useState<Record<number, string>>({});
  const [observacao, setObservacao] = useState("");
  const [nfsDigitadas, setNfsDigitadas] = useState<Record<number, string>>({});

  const almoxarifadoPermitido = podeReceberCompra(usuario?.perfil);
  const comprasPermitido = podeRevisarCompra(usuario?.perfil);

  // OCs abertas para recebimento (ENVIADO ou RECEBIDO_PARCIAL)
  const ocsAbertas = useMemo(() => {
    const t = normaliza(buscaOc);
    return todosPedidos
      .filter((p) => p.status === "ENVIADO" || p.status === "RECEBIDO_PARCIAL")
      .filter((p) => {
        if (!t) return true;
        const oc = normaliza(codigoOc(p));
        const forn = normaliza(p.fornecedor?.nome ?? "");
        return oc.includes(t) || String(p.id) === t || forn.includes(t);
      });
  }, [todosPedidos, buscaOc]);

  const pedidoSelecionado = useMemo(
    () => ocsAbertas.find((p) => p.id === pedidoSelecionadoId) ?? ocsAbertas[0] ?? null,
    [ocsAbertas, pedidoSelecionadoId],
  );

  function selecionarOc(p: PedidoEntrada) {
    setPedidoSelecionadoId(p.id);
    const novosMarcados: Record<number, boolean> = {};
    const novasQtds: Record<number, string> = {};
    for (const i of p.itens ?? []) {
      const aguardando = qtdAguardandoNfDoItem(p, i.id);
      const restante = Math.max(0, Number(i.quantidade) - Number(i.quantidadeRecebida) - aguardando);
      novosMarcados[i.id] = restante > 0;
      novasQtds[i.id] = restante > 0 ? String(restante) : "0";
    }
    setMarcados(novosMarcados);
    setQuantidades(novasQtds);
    setObservacao("");
  }

  function itemMarcado(p: PedidoEntrada, item: ItemPedidoEntrada): boolean {
    if (marcados[item.id] !== undefined) return marcados[item.id];
    const aguardando = qtdAguardandoNfDoItem(p, item.id);
    const restante = Math.max(0, Number(item.quantidade) - Number(item.quantidadeRecebida) - aguardando);
    return restante > 0;
  }

  function qtdItemInput(p: PedidoEntrada, item: ItemPedidoEntrada): string {
    if (quantidades[item.id] !== undefined) return quantidades[item.id];
    const aguardando = qtdAguardandoNfDoItem(p, item.id);
    const restante = Math.max(0, Number(item.quantidade) - Number(item.quantidadeRecebida) - aguardando);
    return String(restante);
  }

  const registrarChegada = useMutation({
    mutationFn: async (p: PedidoEntrada) => {
      const itensSelecionados = (p.itens ?? [])
        .filter((i) => itemMarcado(p, i))
        .map((i) => ({
          itemId: i.id,
          quantidade: qtdItemInput(p, i).replace(",", "."),
        }))
        .filter((i) => Number(i.quantidade) > 0);

      return api(`/pedidos-entrada/${p.id}/receber`, {
        method: "POST",
        body: JSON.stringify({
          observacao: observacao.trim() || null,
          itens: itensSelecionados,
        }),
      });
    },
    onSuccess: (_, p) => {
      setMarcados({});
      setQuantidades({});
      setObservacao("");
      setAbaRecebimentos("AGUARDANDO_NF");
      qc.invalidateQueries();
      toast.success(
        `Chegada da ${codigoOc(p)} registrada! Os materiais entrarão no estoque após o Setor de Compras vincular a NF.`,
        { duration: 6000 },
      );
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const vincularNf = useMutation({
    mutationFn: async ({ recebimentoId, numeroNf }: { recebimentoId: number; numeroNf: string }) =>
      api(`/pedidos-entrada/recebimentos/${recebimentoId}/nf`, {
        method: "POST",
        body: JSON.stringify({ numeroNf }),
      }),
    onSuccess: (_, vars) => {
      setNfsDigitadas((prev) => ({ ...prev, [vars.recebimentoId]: "" }));
      qc.invalidateQueries();
      toast.success(`NF ${vars.numeroNf} vinculada! Os materiais foram adicionados ao saldo do estoque.`);
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  return (
    <div className="space-y-10">
      {/* ETAPA 1: Conferência física de chegada por OC (Almoxarifado / Supervisor) */}
      <section aria-labelledby="titulo-chegada" className="space-y-4">
        <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-4 text-sm text-blue-950 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200">
          <p className="font-semibold">Fluxo de Recebimento em 2 etapas (OC + NF)</p>
          <p className="mt-0.5 text-xs opacity-90">
            1. O <strong>Almoxarifado</strong> seleciona a <strong>OC (Ordem de Compra)</strong>, marca os itens que
            chegaram e informa a quantidade recebida (total ou parcial).{" "}
            2. O <strong>Setor de Compras</strong> informa a <strong>NF (Nota Fiscal)</strong> dos materiais recebidos
            para liberar a soma no saldo do estoque.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 id="titulo-chegada" className="mb-4 text-lg font-semibold">
            1. Registrar chegada física de materiais (por OC)
          </h2>

          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="busca-oc" className="mb-1.5 block text-sm font-medium">
                Buscar Ordem de Compra (OC) ou fornecedor
              </label>
              <input
                id="busca-oc"
                value={buscaOc}
                onChange={(e) => setBuscaOc(e.target.value)}
                placeholder="Ex.: OC-0005, 5 ou nome do fornecedor"
                className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-blue-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus-visible:outline-blue-400"
              />
            </div>

            <div>
              <label htmlFor="select-oc" className="mb-1.5 block text-sm font-medium">
                Selecionar OC aprovada pelo Compras
              </label>
              <select
                id="select-oc"
                value={pedidoSelecionado?.id ?? ""}
                onChange={(e) => {
                  const p = ocsAbertas.find((x) => x.id === Number(e.target.value));
                  if (p) selecionarOc(p);
                }}
                className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-blue-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus-visible:outline-blue-400"
              >
                {ocsAbertas.length === 0 ? (
                  <option value="">Nenhuma OC aguardando entrega</option>
                ) : (
                  ocsAbertas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {codigoOc(p)} — {p.fornecedor?.nome ?? `Fornecedor ${p.fornecedorId}`}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {carregandoPedidos ? (
            <div className="h-32 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
          ) : !pedidoSelecionado ? (
            <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
              Nenhuma Ordem de Compra aberta para recebimento com esse filtro.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-4 py-3 text-sm dark:bg-slate-800/60">
                <div>
                  <span className="rounded-md bg-blue-100 px-2 py-0.5 font-mono text-xs font-semibold text-blue-800 dark:bg-blue-950/80 dark:text-blue-300">
                    {codigoOc(pedidoSelecionado)}
                  </span>
                  <span className="ml-2 font-semibold">
                    {pedidoSelecionado.fornecedor?.nome ?? `Fornecedor ${pedidoSelecionado.fornecedorId}`}
                  </span>
                </div>
                <span className="text-xs text-slate-600 dark:text-slate-400">
                  Pedido em {fmtDataHora(pedidoSelecionado.dataPedido)}
                </span>
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                    <tr>
                      <th className="w-12 p-3 text-center font-medium">Chegou?</th>
                      <th className="p-3 font-medium">Material / Produto</th>
                      <th className="p-3 text-right font-medium">Pedido na OC</th>
                      <th className="p-3 text-right font-medium">Já no estoque</th>
                      <th className="p-3 text-right font-medium">Aguard. NF</th>
                      <th className="p-3 text-right font-medium">Qtd recebida agora</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {(pedidoSelecionado.itens ?? []).map((item) => {
                      const un = item.produto?.unidade ?? "un";
                      const aguardandoNf = qtdAguardandoNfDoItem(pedidoSelecionado, item.id);
                      const restante = Math.max(
                        0,
                        Number(item.quantidade) - Number(item.quantidadeRecebida) - aguardandoNf,
                      );
                      const marcado = itemMarcado(pedidoSelecionado, item) && restante > 0;
                      const valorInput = qtdItemInput(pedidoSelecionado, item);

                      return (
                        <tr
                          key={item.id}
                          className={restante === 0 ? "bg-slate-50/60 opacity-60 dark:bg-slate-900/40" : ""}
                        >
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              aria-label={`Marcar chegada de ${item.produto?.nome ?? `item ${item.id}`}`}
                              disabled={!almoxarifadoPermitido || restante <= 0}
                              checked={marcado}
                              onChange={(e) =>
                                setMarcados((prev) => ({
                                  ...prev,
                                  [item.id]: e.target.checked,
                                }))
                              }
                              className="size-5 accent-blue-700 dark:accent-blue-500"
                            />
                          </td>
                          <td className="p-3">
                            <p className="font-medium">{item.produto?.nome ?? `Produto ${item.produtoId}`}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              Código: {item.produto?.codigo ?? item.produtoId}
                            </p>
                          </td>
                          <td className="p-3 text-right tabular-nums">
                            {fmt(item.quantidade)} {un}
                          </td>
                          <td className="p-3 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                            {fmt(item.quantidadeRecebida)} {un}
                          </td>
                          <td className="p-3 text-right tabular-nums text-amber-700 dark:text-amber-400">
                            {fmt(aguardandoNf)} {un}
                          </td>
                          <td className="p-3 text-right">
                            {restante <= 0 ? (
                              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Completo</span>
                            ) : (
                              <div className="inline-flex items-center justify-end gap-1.5">
                                <input
                                  inputMode="decimal"
                                  aria-label={`Quantidade recebida de ${item.produto?.nome ?? `item ${item.id}`}`}
                                  disabled={!almoxarifadoPermitido || !marcado}
                                  value={valorInput}
                                  onChange={(e) =>
                                    setQuantidades((prev) => ({
                                      ...prev,
                                      [item.id]: e.target.value,
                                    }))
                                  }
                                  className="h-10 w-24 rounded-lg border border-slate-300 bg-white px-2.5 text-right tabular-nums disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                />
                                <span className="text-xs text-slate-500 dark:text-slate-400">{un}</span>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label htmlFor="obs-recebimento" className="mb-1.5 block text-xs font-medium">
                    Observação da entrega (opcional)
                  </label>
                  <input
                    id="obs-recebimento"
                    disabled={!almoxarifadoPermitido}
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    placeholder="Ex.: Entrega parcial — faltaram 5 unidades que virão na próxima remessa"
                    className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>

                {almoxarifadoPermitido ? (
                  <button
                    type="button"
                    disabled={registrarChegada.isPending}
                    onClick={() => registrarChegada.mutate(pedidoSelecionado)}
                    className="h-11 rounded-lg bg-blue-700 px-5 text-sm font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-blue-600 dark:hover:bg-blue-500"
                  >
                    {registrarChegada.isPending
                      ? "Registrando chegada..."
                      : "Registrar chegada (aguardar NF do Compras)"}
                  </button>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Apenas <strong>Almoxarifado</strong> ou <strong>Supervisor</strong> podem registrar a chegada física
                    dos materiais.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ETAPA 2: Vinculação da Nota Fiscal pelo Setor de Compras para entrada efetiva no estoque */}
      <section aria-labelledby="titulo-nf" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="titulo-nf" className="text-lg font-semibold">
              2. Conferência de Nota Fiscal (NF) e Entrada no Estoque
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Os itens recebidos pelo almoxarifado só entram no saldo do estoque quando o usuário{" "}
              <strong>Compras</strong> (ou Supervisor) vincula a Nota Fiscal.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAbaRecebimentos("AGUARDANDO_NF")}
              className={`h-9 rounded-lg px-3 text-xs font-medium transition-colors ${
                abaRecebimentos === "AGUARDANDO_NF"
                  ? "bg-amber-600 text-white"
                  : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
              }`}
            >
              Aguardando NF
            </button>
            <button
              type="button"
              onClick={() => setAbaRecebimentos("CONCLUIDO")}
              className={`h-9 rounded-lg px-3 text-xs font-medium transition-colors ${
                abaRecebimentos === "CONCLUIDO"
                  ? "bg-emerald-700 text-white"
                  : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
              }`}
            >
              Com NF (Já no estoque)
            </button>
          </div>
        </div>

        {carregandoRecebimentos ? (
          <div className="h-32 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
        ) : recebimentos.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
            {abaRecebimentos === "AGUARDANDO_NF"
              ? "Nenhum recebimento aguardando lançamento de Nota Fiscal no momento."
              : "Nenhum recebimento com Nota Fiscal concluído ainda."}
          </p>
        ) : (
          <div className="space-y-4">
            {recebimentos.map((rec) => {
              const oc = rec.pedido ? codigoOc(rec.pedido) : `OC-${String(rec.pedidoId).padStart(4, "0")}`;
              const nfValor = nfsDigitadas[rec.id] ?? "";

              return (
                <article
                  key={rec.id}
                  className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                >
                  <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-4 dark:border-slate-800">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-blue-100 px-2 py-0.5 font-mono text-xs font-semibold text-blue-800 dark:bg-blue-950/80 dark:text-blue-300">
                        {oc}
                      </span>
                      <span className="font-semibold">
                        {rec.pedido?.fornecedor?.nome ?? `Pedido #${rec.pedidoId}`}
                      </span>
                      {rec.status === "AGUARDANDO_NF" ? (
                        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                          Aguardando NF · Pendente no estoque
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                          NF {rec.numeroNf} · Somado ao estoque
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Recebido em {fmtDataHora(rec.dataRecebimento)}
                      {rec.recebidoPorNome ? ` por ${rec.recebidoPorNome}` : ""}
                    </div>
                  </header>

                  <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                    {rec.itens.map((ri) => {
                      const prod = ri.itemPedido?.produto;
                      const un = prod?.unidade ?? "un";
                      return (
                        <li key={ri.id} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
                          <div>
                            <span className="font-medium">{prod?.nome ?? `Produto ${ri.produtoId}`}</span>
                            {prod?.codigo && (
                              <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">{prod.codigo}</span>
                            )}
                          </div>
                          <span className="font-semibold tabular-nums">
                            +{fmt(ri.quantidade)} {un}
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  {rec.observacao && (
                    <p className="border-t border-slate-200 px-4 py-2 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
                      Observação do almoxarifado: {rec.observacao}
                    </p>
                  )}

                  {rec.status === "AGUARDANDO_NF" && (
                    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                      {comprasPermitido ? (
                        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
                          <label htmlFor={`nf-${rec.id}`} className="text-xs font-medium">
                            Número da NF (Nota Fiscal):
                          </label>
                          <input
                            id={`nf-${rec.id}`}
                            value={nfValor}
                            onChange={(e) => setNfsDigitadas((prev) => ({ ...prev, [rec.id]: e.target.value }))}
                            placeholder="Ex.: NF-e 000.458.912"
                            className="h-10 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-blue-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                          />
                          <button
                            type="button"
                            disabled={!nfValor.trim() || vincularNf.isPending}
                            onClick={() => vincularNf.mutate({ recebimentoId: rec.id, numeroNf: nfValor.trim() })}
                            className="h-10 rounded-lg bg-emerald-700 px-4 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                          >
                            {vincularNf.isPending ? "Liberando..." : "Vincular NF e adicionar ao estoque"}
                          </button>
                        </div>
                      ) : (
                        <p className="text-xs text-amber-800 dark:text-amber-300">
                          Chegada física conferida pelo almoxarifado. Aguardando o <strong>Setor de Compras</strong>{" "}
                          informar a Nota Fiscal (NF) para que estes itens sejam adicionados ao estoque.
                        </p>
                      )}
                    </footer>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}


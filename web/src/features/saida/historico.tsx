"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { podeDesfazerRetirada, useSessao } from "@/lib/auth";
import { mensagemDeErro } from "@/lib/errors";
import { dataLocal, fmt, fmtDataHora } from "@/lib/format";
import {
  useDetalhesRetiradas,
  useHistoricoSaidas,
  useProdutos,
  useRequisitantes,
  type FiltrosHistorico,
} from "@/lib/hooks";
import type { Retirada } from "@/lib/types";

const TAMANHOS = [10, 20, 50, 100];

// Últimos 30 dias, sem filtro de produto nem de funcionário.
function padrao(): FiltrosHistorico {
  const inicio = new Date();
  inicio.setDate(inicio.getDate() - 30);
  return { de: dataLocal(inicio), ate: dataLocal(), produtoId: "", requisitanteId: "" };
}

// Devolve a mensagem de erro do filtro, ou null se estiver válido.
function validar(f: FiltrosHistorico): string | null {
  if (!f.de || !f.ate) return "Informe a data inicial e a data final do período.";
  const de = new Date(`${f.de}T00:00:00`);
  const ate = new Date(`${f.ate}T00:00:00`);
  if (Number.isNaN(de.getTime()) || Number.isNaN(ate.getTime())) return "Data inválida. Confira o período informado.";
  if (de > ate) return "A data inicial não pode ser depois da data final.";
  if (ate > new Date(`${dataLocal()}T00:00:00`)) return "O período não pode ter datas no futuro.";
  const limite = new Date(de);
  limite.setFullYear(limite.getFullYear() + 1);
  if (ate > limite) return "O período não pode ser maior que 1 ano.";
  return null;
}

const campo =
  "h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-blue-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus-visible:outline-blue-400";

export function Historico() {
  const qc = useQueryClient();
  const { usuario } = useSessao();
  const { data: produtos = [] } = useProdutos();
  const { data: requisitantes = [] } = useRequisitantes();
  const permiteDesfazer = podeDesfazerRetirada(usuario?.perfil);

  const [hoje, setHoje] = useState("");
  const [form, setForm] = useState<FiltrosHistorico>({ de: "", ate: "", produtoId: "", requisitanteId: "" });
  const [aplicados, setAplicados] = useState<FiltrosHistorico | null>(null);
  const [pagina, setPagina] = useState(1);
  const [limite, setLimite] = useState(10);
  const [confirmando, setConfirmando] = useState<number | null>(null);

  // Datas só no cliente: evita diferença de fuso entre servidor e navegador.
  useEffect(() => {
    const p = padrao();
    setHoje(p.ate);
    setForm(p);
    setAplicados(p);
  }, []);

  const { data, isLoading, isFetching, isError, error, refetch } = useHistoricoSaidas(aplicados, pagina, limite);

  // Erro ao carregar: pop-up vermelho (mesmo id, então não empilha).
  useEffect(() => {
    if (isError) toast.error(mensagemDeErro(error), { id: "historico-erro" });
  }, [isError, error]);

  const retiradas = data?.itens ?? [];
  const total = data?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / limite));

  // Se a lista encolheu, não fica numa página inexistente.
  useEffect(() => {
    if (data && pagina > totalPaginas) setPagina(totalPaginas);
  }, [data, pagina, totalPaginas]);

  // Retiradas cuja listagem veio sem itens: busca o detalhe de cada uma.
  const idsSemItens = retiradas.filter((r) => r.itens === undefined).map((r) => r.id);
  const detalhes = useDetalhesRetiradas(idsSemItens);
  const detalhePorId = useMemo(() => {
    const m = new Map<number, { retirada?: Retirada; carregando: boolean; erro: boolean }>();
    idsSemItens.forEach((id, i) =>
      m.set(id, { retirada: detalhes[i]?.data, carregando: !!detalhes[i]?.isLoading, erro: !!detalhes[i]?.isError }),
    );
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsSemItens.join(","), detalhes.map((d) => d.dataUpdatedAt + String(d.status)).join(",")]);

  const falhouItens = detalhes.some((d) => d.isError);
  useEffect(() => {
    if (falhouItens) toast.error("Não foi possível carregar os itens de algumas retiradas.", { id: "historico-itens" });
  }, [falhouItens]);

  const produtoPorId = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);
  const nomePorId = useMemo(() => new Map(requisitantes.map((r) => [r.id, r.nome])), [requisitantes]);

  // Desfazer = cancelar o pedido; a API estorna os itens e o saldo volta ao estoque.
  const desfazer = useMutation({
    mutationFn: (id: number) => api(`/pedidos-saida/${id}/cancelar`, { method: "POST" }),
    onSuccess: () => {
      setConfirmando(null);
      qc.invalidateQueries(); // histórico, saldos e reposição
      toast.success("Retirada desfeita. Os itens voltaram ao estoque.");
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  function filtrar(e: React.FormEvent) {
    e.preventDefault();
    const erro = validar(form);
    if (erro) {
      toast.error(erro, { id: "historico-filtro" });
      return;
    }
    setPagina(1);
    setAplicados(form);
  }

  function limpar() {
    const p = padrao();
    setForm(p);
    setPagina(1);
    setAplicados(p);
  }

  const inicio = total === 0 ? 0 : (pagina - 1) * limite + 1;
  const fim = Math.min(pagina * limite, total);
  const filtroProduto = aplicados?.produtoId ? Number(aplicados.produtoId) : null;

  return (
    <section aria-labelledby="titulo-historico" className="mt-12 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="titulo-historico" className="text-xl font-semibold">
          Histórico de retiradas
        </h2>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={!aplicados || isFetching}
          className="h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
        >
          {isFetching ? "Atualizando..." : "Atualizar lista"}
        </button>
      </div>

      <form
        onSubmit={filtrar}
        className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-2"
      >
        <div>
          <label htmlFor="h-de" className="mb-1 block text-sm font-medium">
            De
          </label>
          <input
            id="h-de"
            type="date"
            max={hoje || undefined}
            value={form.de}
            onChange={(e) => setForm((f) => ({ ...f, de: e.target.value }))}
            className={campo}
          />
        </div>
        <div>
          <label htmlFor="h-ate" className="mb-1 block text-sm font-medium">
            Até
          </label>
          <input
            id="h-ate"
            type="date"
            max={hoje || undefined}
            value={form.ate}
            onChange={(e) => setForm((f) => ({ ...f, ate: e.target.value }))}
            className={campo}
          />
        </div>
        <div>
          <label htmlFor="h-produto" className="mb-1 block text-sm font-medium">
            Produto
          </label>
          <select
            id="h-produto"
            value={form.produtoId}
            onChange={(e) => setForm((f) => ({ ...f, produtoId: e.target.value }))}
            className={campo}
          >
            <option value="">Todos os produtos</option>
            {[...produtos]
              .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label htmlFor="h-func" className="mb-1 block text-sm font-medium">
            Funcionário
          </label>
          <select
            id="h-func"
            value={form.requisitanteId}
            onChange={(e) => setForm((f) => ({ ...f, requisitanteId: e.target.value }))}
            className={campo}
          >
            <option value="">Todos os funcionários</option>
            {requisitantes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 sm:col-span-2">
          <button
            type="submit"
            className="h-11 rounded-lg bg-blue-700 px-5 text-sm font-medium text-white hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            Filtrar
          </button>
          <button
            type="button"
            onClick={limpar}
            className="h-11 rounded-lg border border-slate-300 bg-white px-5 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            Limpar filtros
          </button>
        </div>
      </form>

      {isLoading || !aplicados ? (
        <div className="h-40 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
      ) : isError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          Não foi possível carregar o histórico. Use “Atualizar lista” para tentar de novo.
        </p>
      ) : retiradas.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-600 dark:border-slate-700 dark:text-slate-400">
          Nenhuma retirada encontrada neste período. Ajuste os filtros para ampliar a busca.
        </p>
      ) : (
        <ul
          className={`divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900 ${isFetching ? "opacity-60" : ""}`}
        >
          {retiradas.map((r) => {
            const desfeita = r.status === "CANCELADO";
            const det = detalhePorId.get(r.id);
            const itens = r.itens ?? det?.retirada?.itens;
            const estaConfirmando = confirmando === r.id;
            const processando = desfazer.isPending && desfazer.variables === r.id;

            return (
              <li key={r.id} className="space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {r.requisitante?.nome ?? nomePorId.get(r.requisitanteId) ?? `Funcionário ${r.requisitanteId}`}
                  </p>
                  <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
                    <time dateTime={r.dataPedido}>{fmtDataHora(r.dataPedido)}</time>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        desfeita
                          ? "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                      }`}
                    >
                      {desfeita ? "Desfeita" : "Concluída"}
                    </span>
                  </div>
                </div>

                {/* O que foi retirado e quanto */}
                {itens ? (
                  <ul
                    className={`space-y-1 text-sm ${
                      desfeita ? "text-slate-500 line-through dark:text-slate-500" : "text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    {itens.map((i) => {
                      const p = produtoPorId.get(i.produtoId);
                      const nome = i.produto?.nome ?? p?.nome ?? `Produto ${i.produtoId}`;
                      const un = i.produto?.unidade ?? p?.unidade ?? "";
                      return (
                        <li
                          key={i.id}
                          className={`flex justify-between gap-4 ${
                            i.produtoId === filtroProduto ? "font-semibold text-slate-900 dark:text-slate-100" : ""
                          }`}
                        >
                          <span>{nome}</span>
                          <span className="whitespace-nowrap tabular-nums">
                            {fmt(i.quantidade)} {un}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : det?.erro ? (
                  <p className="text-sm text-red-700 dark:text-red-400">
                    Não foi possível carregar os itens desta retirada.
                  </p>
                ) : (
                  <div className="h-5 w-2/3 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                )}

                {/* Desfazer: pede confirmação antes de devolver ao estoque (apenas Almoxarifado e Supervisor) */}
                {!desfeita &&
                  permiteDesfazer &&
                  (estaConfirmando ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm dark:bg-amber-950/40">
                      <span className="mr-auto text-amber-900 dark:text-amber-200">
                        Desfazer esta retirada? Os itens voltam ao estoque.
                      </span>
                      <button
                        type="button"
                        onClick={() => desfazer.mutate(r.id)}
                        disabled={processando}
                        className="h-11 rounded-lg bg-red-700 px-4 font-medium text-white hover:bg-red-800 disabled:opacity-60 dark:bg-red-600 dark:hover:bg-red-500"
                      >
                        {processando ? "Desfazendo..." : "Sim, desfazer"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmando(null)}
                        disabled={processando}
                        className="h-11 rounded-lg border border-slate-300 bg-white px-4 font-medium hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                      >
                        Manter
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmando(r.id)}
                      className="h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-slate-700 dark:bg-slate-800 dark:text-red-400 dark:hover:bg-red-950/40"
                    >
                      Desfazer retirada
                    </button>
                  ))}
              </li>
            );
          })}
        </ul>
      )}

      {aplicados && total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p aria-live="polite" className="text-slate-600 dark:text-slate-400">
            Mostrando {inicio}–{fim} de {total} retiradas
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2">
              Por página
              <select
                value={limite}
                onChange={(e) => {
                  setLimite(Number(e.target.value));
                  setPagina(1);
                }}
                className="h-11 rounded-lg border border-slate-300 bg-white px-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                {TAMANHOS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              disabled={pagina <= 1 || isFetching}
              className="h-11 rounded-lg border border-slate-300 bg-white px-4 font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              Anterior
            </button>
            <span className="tabular-nums">
              Página {pagina} de {totalPaginas}
            </span>
            <button
              type="button"
              onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
              disabled={pagina >= totalPaginas || isFetching}
              className="h-11 rounded-lg border border-slate-300 bg-white px-4 font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { mensagemDeErro } from "@/lib/errors";
import { fmt, normaliza } from "@/lib/format";
import { useProdutos, useRequisitantes } from "@/lib/hooks";
import type { Faltante, Produto } from "@/lib/types";

const CHAVE_REQUISITANTE = "estoque:requisitanteId";

export function SaidaForm() {
  const qc = useQueryClient();
  const { data: produtos = [] } = useProdutos();
  const { data: requisitantes = [] } = useRequisitantes();

  const busca = useRef<HTMLInputElement>(null);
  const [termo, setTermo] = useState("");
  const [carrinho, setCarrinho] = useState<Record<number, number>>({});
  const [requisitanteId, setRequisitanteId] = useState("");
  const [faltantes, setFaltantes] = useState<Record<number, string>>({});

  // Lembra o último requisitante usado.
  useEffect(() => {
    try {
      setRequisitanteId(localStorage.getItem(CHAVE_REQUISITANTE) ?? "");
    } catch {}
  }, []);

  // "/" leva o foco para a busca de qualquer lugar da tela.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "SELECT", "TEXTAREA"].includes(alvo.tagName)) {
        e.preventDefault();
        busca.current?.focus();
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

  const porId = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);

  const resultados = useMemo(() => {
    const t = normaliza(termo);
    if (!t) return [];
    return produtos
      .filter((p) => p.ativo && (normaliza(p.nome).includes(t) || normaliza(p.codigo).includes(t)))
      .slice(0, 8);
  }, [produtos, termo]);

  function adicionar(p: Produto) {
    setCarrinho((c) => ({ ...c, [p.id]: (c[p.id] ?? 0) + 1 }));
    setFaltantes({});
    setTermo("");
    busca.current?.focus();
  }

  function alterar(id: number, delta: number) {
    setCarrinho((c) => {
      const proximo = (c[id] ?? 0) + delta;
      const { [id]: _, ...resto } = c;
      return proximo > 0 ? { ...resto, [id]: proximo } : resto;
    });
    setFaltantes({});
  }

  async function desfazer(pedidoId: number) {
    try {
      await api(`/pedidos-saida/${pedidoId}/cancelar`, { method: "POST" });
      qc.invalidateQueries();
      toast.success("Retirada desfeita");
    } catch (e) {
      toast.error(mensagemDeErro(e));
    }
  }

  const enviar = useMutation({
    mutationFn: () =>
      api<{ id?: number; data?: { id: number } }>("/pedidos-saida", {
        method: "POST",
        body: JSON.stringify({
          requisitanteId: Number(requisitanteId),
          itens: Object.entries(carrinho).map(([produtoId, q]) => ({
            produtoId: Number(produtoId),
            quantidade: String(q),
          })),
        }),
      }),
    onSuccess: (res) => {
      const id = res?.id ?? res?.data?.id;
      setCarrinho({});
      setFaltantes({});
      qc.invalidateQueries(); // saldo mudou: produtos, reposição e estoque
      toast.success("Retirada registrada", {
        duration: 8000,
        action: id ? { label: "Desfazer", onClick: () => desfazer(id) } : undefined,
      });
      busca.current?.focus();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === "SALDO_INSUFICIENTE") {
        const mapa: Record<number, string> = {};
        for (const d of e.details as Faltante[]) mapa[d.produtoId] = d.saldoAtual;
        setFaltantes(mapa);
      }
      toast.error(mensagemDeErro(e));
    },
  });

  const itens = Object.keys(carrinho).length;
  const podeConfirmar = itens > 0 && requisitanteId !== "" && !enviar.isPending;

  return (
    <div
      className="space-y-6"
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.ctrlKey && podeConfirmar) enviar.mutate();
      }}
    >
      <div className="relative">
        <label htmlFor="busca" className="mb-2 block text-sm font-medium">
          Buscar produto por nome ou código
        </label>
        <input
          id="busca"
          ref={busca}
          autoFocus
          autoComplete="off"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setTermo("");
            if (e.key === "Enter" && !e.ctrlKey && resultados.length > 0) {
              e.preventDefault();
              // Código exato (leitor de código de barras) tem prioridade.
              const exato = resultados.find((p) => normaliza(p.codigo) === normaliza(termo));
              adicionar(exato ?? resultados[0]);
            }
          }}
          placeholder="Digite ou passe o leitor. Enter adiciona."
          className="h-12 w-full rounded-lg border border-slate-300 bg-white px-4 text-base focus-visible:outline-2 focus-visible:outline-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus-visible:outline-blue-400"
        />
        {resultados.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
            {resultados.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => adicionar(p)}
                  className="flex min-h-11 w-full items-center justify-between px-4 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <span>
                    <span className="font-medium">{p.nome}</span>
                    <span className="ml-2 text-sm text-slate-500 dark:text-slate-400">{p.codigo}</span>
                  </span>
                  <span className="text-sm text-slate-600 dark:text-slate-400">
                    {fmt(p.saldoAtual)} {p.unidade}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {termo && resultados.length === 0 && (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Nenhum produto encontrado para “{termo}”.</p>
        )}
      </div>

      <section aria-label="Itens da retirada">
        {itens === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-600 dark:border-slate-700 dark:text-slate-400">
            Nenhum item ainda. Busque um produto para começar a retirada.
          </p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
            {Object.entries(carrinho).map(([id, qtd]) => {
              const p = porId.get(Number(id));
              const faltou = faltantes[Number(id)];
              return (
                <li
                  key={id}
                  className={`flex items-center justify-between gap-3 p-4 ${faltou !== undefined ? "bg-red-50 dark:bg-red-950/40" : ""}`}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p?.nome ?? `Produto ${id}`}</p>
                    <p
                      className={`text-sm ${faltou !== undefined ? "font-medium text-red-700 dark:text-red-400" : "text-slate-600 dark:text-slate-400"}`}
                    >
                      {faltou !== undefined
                        ? `Saldo insuficiente: restam ${fmt(faltou)} ${p?.unidade ?? ""}`
                        : `Em estoque: ${p ? fmt(p.saldoAtual) : "-"} ${p?.unidade ?? ""}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={`Diminuir ${p?.nome ?? "item"}`}
                      onClick={() => alterar(Number(id), -1)}
                      className="size-11 rounded-lg border border-slate-300 text-xl hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      −
                    </button>
                    <span className="w-10 text-center text-lg font-semibold tabular-nums">{qtd}</span>
                    <button
                      type="button"
                      aria-label={`Aumentar ${p?.nome ?? "item"}`}
                      onClick={() => alterar(Number(id), 1)}
                      className="size-11 rounded-lg border border-slate-300 text-xl hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      +
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="requisitante" className="mb-2 block text-sm font-medium">
            Quem está retirando
          </label>
          <select
            id="requisitante"
            value={requisitanteId}
            onChange={(e) => {
              setRequisitanteId(e.target.value);
              try {
                localStorage.setItem(CHAVE_REQUISITANTE, e.target.value);
              } catch {}
            }}
            className="h-12 w-full rounded-lg border border-slate-300 bg-white px-3 focus-visible:outline-2 focus-visible:outline-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus-visible:outline-blue-400"
          >
            <option value="">Selecione</option>
            {requisitantes
              .filter((r) => r.ativo)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                  {r.setor ? ` (${r.setor})` : ""}
                </option>
              ))}
          </select>
        </div>
        <button
          type="button"
          disabled={!podeConfirmar}
          onClick={() => enviar.mutate()}
          className="h-12 rounded-lg bg-blue-700 px-6 font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300 dark:bg-blue-600 dark:hover:bg-blue-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
        >
          {enviar.isPending ? "Registrando..." : "Registrar retirada"}
        </button>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Atalhos: / busca, Enter adiciona, Ctrl+Enter registra, Esc limpa.
      </p>
    </div>
  );
}

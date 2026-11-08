"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { podeSolicitarCompra, useSessao } from "@/lib/auth";
import { mensagemDeErro } from "@/lib/errors";
import { fmt } from "@/lib/format";
import { useSugestoes } from "@/lib/hooks";
import type { GrupoSugestao } from "@/lib/types";

export function Sugestoes() {
  const qc = useQueryClient();
  const router = useRouter();
  const { usuario } = useSessao();
  const { data: grupos = [], isLoading, isError, error } = useSugestoes();
  const [quantidades, setQuantidades] = useState<Record<number, string>>({});
  const [excluidos, setExcluidos] = useState<Record<number, boolean>>({});
  const permitidoSolicitar = podeSolicitarCompra(usuario?.perfil);

  const gerar = useMutation({
    mutationFn: (g: GrupoSugestao) =>
      api("/reposicao/rascunhos", {
        method: "POST",
        body: JSON.stringify({
          fornecedorId: g.fornecedorId,
          itens: g.itens
            .filter((i) => !excluidos[i.produtoId])
            .map((i) => ({ produtoId: i.produtoId, quantidade: quantidades[i.produtoId] ?? i.qtdSugerida })),
        }),
      }),
    onSuccess: (_, g) => {
      qc.invalidateQueries();
      toast.success(
        `Solicitação de compra criada para ${g.fornecedorNome ?? "o fornecedor"} e enviada para revisão de Compras / Supervisor`,
        {
          duration: 6000,
          action: {
            label: "Ver solicitações",
            onClick: () => router.push("/compras"),
          },
        },
      );
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  if (isLoading) return <div className="h-40 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />;
  if (isError) return <p className="text-red-700 dark:text-red-400">{mensagemDeErro(error)}</p>;
  if (grupos.length === 0)
    return (
      <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-600 dark:border-slate-700 dark:text-slate-400">
        Nenhum produto abaixo do ponto. Tudo certo por aqui.
      </p>
    );

  return (
    <div className="space-y-6">
      {grupos.map((g) => {
        const selecionados = g.itens.filter((i) => !excluidos[i.produtoId]).length;
        return (
          <section
            key={g.fornecedorId ?? "sem"}
            className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
          >
            <header className="flex items-center justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-800">
              <h2 className="font-semibold">{g.fornecedorNome ?? "Sem fornecedor cadastrado"}</h2>
              <button
                type="button"
                disabled={!permitidoSolicitar || g.fornecedorId == null || selecionados === 0 || gerar.isPending}
                onClick={() => gerar.mutate(g)}
                className="h-11 rounded-lg bg-blue-700 px-4 text-sm font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300 dark:bg-blue-600 dark:hover:bg-blue-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
              >
                Solicitar compra ({selecionados})
              </button>
            </header>
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {g.itens.map((i) => (
                <li key={i.produtoId} className="flex items-center gap-3 p-4">
                  <input
                    type="checkbox"
                    aria-label={`Incluir ${i.nome}`}
                    checked={!excluidos[i.produtoId]}
                    onChange={(e) => setExcluidos((x) => ({ ...x, [i.produtoId]: !e.target.checked }))}
                    className="size-5 accent-blue-700 dark:accent-blue-500"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{i.nome}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Estoque {fmt(i.saldoAtual)} {i.unidade}
                      {i.diasRestantes != null && ` · acaba em ${fmt(i.diasRestantes)} dias`}
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <span className="sr-only">Quantidade a comprar de {i.nome}</span>
                    <input
                      inputMode="decimal"
                      value={quantidades[i.produtoId] ?? i.qtdSugerida}
                      onChange={(e) => setQuantidades((q) => ({ ...q, [i.produtoId]: e.target.value }))}
                      className="h-11 w-24 rounded-lg border border-slate-300 bg-white px-3 text-right tabular-nums dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                    {i.unidade}
                  </label>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

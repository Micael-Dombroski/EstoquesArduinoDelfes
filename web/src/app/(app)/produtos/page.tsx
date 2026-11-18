"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { podeEditarEstoqueMinimo, useSessao } from "@/lib/auth";
import { mensagemDeErro } from "@/lib/errors";
import { fmt, normaliza, semaforo, type Semaforo } from "@/lib/format";
import { useAnaliseReposicaoCompleta, useProdutos } from "@/lib/hooks";

const ROTULO: Record<Semaforo, { texto: string; classe: string }> = {
  critico: { texto: "Crítico", classe: "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300" },
  atencao: { texto: "Atenção", classe: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300" },
  ok: { texto: "Ok", classe: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300" },
};

export default function ProdutosPage() {
  const qc = useQueryClient();
  const { usuario } = useSessao();
  const podeEditarMinimo = podeEditarEstoqueMinimo(usuario?.perfil);

  const { data: produtos = [], isLoading, isError, error } = useProdutos();
  const { data: gruposAnalise = [] } = useAnaliseReposicaoCompleta(podeEditarMinimo);
  const [termo, setTermo] = useState("");

  // Estado de edição inline do estoque mínimo (pontoReposicao)
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [valorMinimo, setValorMinimo] = useState("");

  const pontoSugeridoPorProduto = useMemo(() => {
    const mapa = new Map<number, string>();
    for (const g of gruposAnalise) {
      for (const item of g.itens) {
        if (item.pontoSugerido && Number(item.pontoSugerido) > 0) {
          mapa.set(item.produtoId, String(item.pontoSugerido));
        }
      }
    }
    return mapa;
  }, [gruposAnalise]);

  const lista = useMemo(() => {
    const t = normaliza(termo);
    return produtos.filter(
      (p) => p.ativo && (!t || normaliza(p.nome).includes(t) || normaliza(p.codigo).includes(t)),
    );
  }, [produtos, termo]);

  const salvarMinimo = useMutation({
    mutationFn: async ({ id, pontoReposicao }: { id: number; pontoReposicao: string }) => {
      const limpo = pontoReposicao.replace(",", ".").trim();
      if (!limpo || Number.isNaN(Number(limpo)) || Number(limpo) < 0) {
        throw new Error("Informe um estoque mínimo válido (maior ou igual a zero).");
      }
      return api(`/produtos/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ pontoReposicao: limpo }),
      });
    },
    onSuccess: () => {
      setEditandoId(null);
      qc.invalidateQueries({ queryKey: ["produtos"] });
      qc.invalidateQueries({ queryKey: ["reposicao"] });
      toast.success("Estoque mínimo atualizado com sucesso!");
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  function iniciarEdicao(id: number, atual: string) {
    setEditandoId(id);
    setValorMinimo(String(Number(atual)));
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Produtos</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {podeEditarMinimo
              ? "Consulte o saldo atual e clique no estoque mínimo para ajustá-lo."
              : "Consulte o saldo atual, o estoque mínimo e a situação de cada item."}
          </p>
        </div>
      </div>

      <label htmlFor="filtro" className="sr-only">
        Filtrar produtos
      </label>
      <input
        id="filtro"
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
        placeholder="Filtrar por nome ou código"
        className="mb-4 h-12 w-full rounded-lg border border-slate-300 bg-white px-4 focus-visible:outline-2 focus-visible:outline-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus-visible:outline-blue-400"
      />

      {isLoading && <div className="h-40 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />}
      {isError && <p className="text-red-700 dark:text-red-400">{mensagemDeErro(error)}</p>}
      {!isLoading && !isError && lista.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-600 dark:border-slate-700 dark:text-slate-400">
          Nenhum produto encontrado. Ajuste o filtro ou cadastre um produto.
        </p>
      )}

      {lista.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
              <tr>
                <th className="p-3 font-medium">Código</th>
                <th className="p-3 font-medium">Produto</th>
                <th className="p-3 text-right font-medium">Saldo</th>
                <th className="p-3 text-right font-medium">Estoque mínimo</th>
                <th className="p-3 font-medium">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {lista.map((p) => {
                const s = ROTULO[semaforo(p.saldoAtual, p.pontoReposicao)];
                const emEdicao = editandoId === p.id;
                const sugerido = pontoSugeridoPorProduto.get(p.id);

                return (
                  <tr key={p.id}>
                    <td className="p-3 text-slate-600 dark:text-slate-400">{p.codigo}</td>
                    <td className="p-3 font-medium">{p.nome}</td>
                    <td className="p-3 text-right tabular-nums">
                      {fmt(p.saldoAtual)} {p.unidade}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {!podeEditarMinimo ? (
                        <span className="text-slate-600 dark:text-slate-400">
                          {fmt(p.pontoReposicao)} {p.unidade}
                        </span>
                      ) : emEdicao ? (
                        <div className="inline-flex flex-col items-end gap-1">
                          <div className="flex items-center justify-end gap-1.5">
                            <input
                              inputMode="decimal"
                              autoFocus
                              aria-label={`Novo estoque mínimo de ${p.nome}`}
                              value={valorMinimo}
                              onChange={(e) => setValorMinimo(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  salvarMinimo.mutate({ id: p.id, pontoReposicao: valorMinimo });
                                } else if (e.key === "Escape") {
                                  setEditandoId(null);
                                }
                              }}
                              className="h-8 w-20 rounded-md border border-blue-500 bg-white px-2 text-right text-xs tabular-nums dark:bg-slate-950 dark:text-slate-100"
                            />
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {p.unidade}
                            </span>
                            <button
                              type="button"
                              disabled={salvarMinimo.isPending}
                              onClick={() =>
                                salvarMinimo.mutate({ id: p.id, pontoReposicao: valorMinimo })
                              }
                              className="h-8 rounded-md bg-blue-700 px-2.5 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
                            >
                              Salvar
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditandoId(null)}
                              className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            >
                              Cancelar
                            </button>
                          </div>
                          {sugerido && Number(sugerido) !== Number(valorMinimo) && (
                            <button
                              type="button"
                              onClick={() => setValorMinimo(String(Number(sugerido)))}
                              className="text-[11px] text-blue-600 hover:underline dark:text-blue-400"
                            >
                              Usar sugerido pelo consumo ({fmt(sugerido)} {p.unidade})
                            </button>
                          )}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => iniciarEdicao(p.id, p.pontoReposicao)}
                          title="Clique para editar o estoque mínimo"
                          className="group inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          <span>
                            {fmt(p.pontoReposicao)} {p.unidade}
                          </span>
                          <span className="text-xs text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                            ✎
                          </span>
                        </button>
                      )}
                    </td>
                    <td className="p-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${s.classe}`}>
                        {s.texto}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

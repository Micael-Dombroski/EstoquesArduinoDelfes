"use client";

import { useMemo, useState } from "react";
import { fmt, normaliza, semaforo, type Semaforo } from "@/lib/format";
import { useProdutos } from "@/lib/hooks";
import { mensagemDeErro } from "@/lib/errors";

const ROTULO: Record<Semaforo, { texto: string; classe: string }> = {
  critico: { texto: "Crítico", classe: "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300" },
  atencao: { texto: "Atenção", classe: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300" },
  ok: { texto: "Ok", classe: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300" },
};

export default function ProdutosPage() {
  const { data: produtos = [], isLoading, isError, error } = useProdutos();
  const [termo, setTermo] = useState("");

  const lista = useMemo(() => {
    const t = normaliza(termo);
    return produtos.filter((p) => p.ativo && (!t || normaliza(p.nome).includes(t) || normaliza(p.codigo).includes(t)));
  }, [produtos, termo]);

  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Produtos</h1>
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
                <th className="p-3 font-medium">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {lista.map((p) => {
                const s = ROTULO[semaforo(p.saldoAtual, p.pontoReposicao)];
                return (
                  <tr key={p.id}>
                    <td className="p-3 text-slate-600 dark:text-slate-400">{p.codigo}</td>
                    <td className="p-3 font-medium">{p.nome}</td>
                    <td className="p-3 text-right tabular-nums">
                      {fmt(p.saldoAtual)} {p.unidade}
                    </td>
                    <td className="p-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${s.classe}`}>{s.texto}</span>
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

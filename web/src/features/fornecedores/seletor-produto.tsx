"use client";

import { useMemo, useState } from "react";
import { normaliza } from "@/lib/format";
import type { Produto } from "@/lib/types";

type Props = {
  id: string;
  produtos: Produto[];
  usados: Set<number>; // produtos já escolhidos em outras linhas
  valor: number | null;
  erro?: string;
  onChange: (produtoId: number | null) => void;
  onNovo?: (textoBusca: string) => void; // troca a linha para "produto novo" levando o texto digitado
};

const campo =
  "h-11 w-full rounded-lg border bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-blue-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus-visible:outline-blue-400";

// Busca por nome ou código; produtos já usados em outras linhas não aparecem.
export function SeletorProduto({ id, produtos, usados, valor, erro, onChange, onNovo }: Props) {
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(false);
  const atual = valor != null ? produtos.find((p) => p.id === valor) : undefined;

  const resultados = useMemo(() => {
    const t = normaliza(busca);
    return produtos
      .filter((p) => !usados.has(p.id) && (!t || normaliza(p.nome).includes(t) || normaliza(p.codigo).includes(t)))
      .slice(0, 8);
  }, [produtos, usados, busca]);

  function escolher(p: Produto) {
    onChange(p.id);
    setBusca("");
    setAberto(false);
  }

  function criarNovo() {
    onNovo?.(busca.trim());
    setBusca("");
    setAberto(false);
  }

  if (atual) {
    return (
      <div className="flex h-11 items-center justify-between gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 text-sm dark:border-slate-700 dark:bg-slate-800/50">
        <span className="truncate">
          <span className="font-medium">{atual.nome}</span>{" "}
          <span className="text-slate-500 dark:text-slate-400">{atual.codigo}</span>
        </span>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40"
        >
          Trocar
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        id={id}
        autoComplete="off"
        value={busca}
        placeholder="Buscar produto por nome ou código"
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? `${id}-erro` : undefined}
        onChange={(e) => {
          setBusca(e.target.value);
          setAberto(true);
        }}
        onFocus={() => setAberto(true)}
        onBlur={() => setAberto(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setAberto(false);
          if (e.key === "Enter" && resultados.length > 0) {
            e.preventDefault(); // não envia o formulário
            escolher(resultados[0]);
          }
        }}
        className={`${campo} ${erro ? "border-red-500 dark:border-red-500" : "border-slate-300 dark:border-slate-700"}`}
      />
      {aberto && (
        <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {resultados.length === 0 && (
            <li className="px-3 py-3 text-sm text-slate-600 dark:text-slate-400">
              Nenhum produto disponível para esta busca.
            </li>
          )}
          {resultados.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()} // mantém o foco no campo até o clique registrar
                onClick={() => escolher(p)}
                className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <span className="truncate font-medium">{p.nome}</span>
                <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">{p.codigo}</span>
              </button>
            </li>
          ))}
          {onNovo && (
            <li className="border-t border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={criarNovo}
                className="flex min-h-11 w-full items-center px-3 py-2 text-left text-sm font-medium text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40"
              >
                + Cadastrar {busca.trim() ? `“${busca.trim()}”` : "um produto"} como produto novo
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
"use client";

import { useState } from "react";
import { podeCadastrarFornecedor, podeVerFornecedores, useSessao } from "@/lib/auth";
import { CadastroFornecedor } from "./cadastro-fornecedor";
import { ListaFornecedores } from "./lista-fornecedores";

const ABAS = [
  { id: "criar", rotulo: "Criar" },
  { id: "ativos", rotulo: "Ativos" },
  { id: "desativados", rotulo: "Desativados" },
] as const;

type Aba = (typeof ABAS)[number]["id"];

export function FornecedoresTela() {
  const { usuario } = useSessao();
  const perfil = usuario?.perfil;
  const podeEditar = podeCadastrarFornecedor(perfil);
  const [aba, setAba] = useState<Aba>("criar");

  if (!podeVerFornecedores(perfil)) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-amber-300 bg-amber-50 p-5 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
      >
        <p className="font-medium">Acesso restrito</p>
        <p className="mt-1 text-sm">
          O perfil Solicitante não tem acesso aos fornecedores. Troque de perfil em “Trocar perfil / Sair”.
        </p>
      </div>
    );
  }

  // Quem só consulta não tem a aba "Criar" e começa em "Ativos"
  const abas = podeEditar ? ABAS : ABAS.filter((a) => a.id !== "criar");
  const abaAtual: Aba = !podeEditar && aba === "criar" ? "ativos" : aba;

  return (
    <>
      {!podeEditar && (
        <p className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          Modo de consulta: seu perfil pode ver os fornecedores, mas não cadastrar, editar nem ativar ou desativar.
        </p>
      )}

      <div role="group" aria-label="Seção de fornecedores" className="mb-6 flex flex-wrap gap-2">
        {abas.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setAba(a.id)}
            aria-pressed={abaAtual === a.id}
            className={`h-10 rounded-lg border px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-blue-700 dark:focus-visible:outline-blue-400 ${
              abaAtual === a.id
                ? "border-blue-700 bg-blue-700 text-white dark:border-blue-600 dark:bg-blue-600"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            }`}
          >
            {a.rotulo}
          </button>
        ))}
      </div>

      {/* O formulário fica montado (só escondido) para não perder o que foi digitado ao trocar de aba */}
      {podeEditar && (
        <div hidden={abaAtual !== "criar"}>
          <CadastroFornecedor />
        </div>
      )}
      {abaAtual === "ativos" && <ListaFornecedores ativo somenteLeitura={!podeEditar} />}
      {abaAtual === "desativados" && <ListaFornecedores ativo={false} somenteLeitura={!podeEditar} />}
    </>
  );
}
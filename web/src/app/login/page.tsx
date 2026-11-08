"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTema } from "@/app/providers";
import { api } from "@/lib/api";
import { ROTULO_PERFIL, salvarSessao, type Sessao } from "@/lib/auth";
import { mensagemDeErro } from "@/lib/errors";
import type { PerfilUsuario } from "@/lib/types";

const CONTAS_DEMO: Array<{
  perfil: PerfilUsuario;
  nome: string;
  email: string;
  senha: string;
  destino: string;
}> = [
  {
    perfil: "ALMOXARIFADO",
    nome: "Carlos Eduardo Rocha",
    email: "almoxarifado@estoque.local",
    senha: "123456",
    destino: "/",
  },
  {
    perfil: "COMPRAS",
    nome: "Paula Ribeiro",
    email: "compras@estoque.local",
    senha: "123456",
    destino: "/compras",
  },
  {
    perfil: "SUPERVISOR",
    nome: "Roberto Nunes",
    email: "supervisor@estoque.local",
    senha: "123456",
    destino: "/compras",
  },
  {
    perfil: "SOLICITANTE",
    nome: "Ana Beatriz Lima",
    email: "solicitante@estoque.local",
    senha: "123456",
    destino: "/saida",
  },
];

function destinoPadrao(perfil: PerfilUsuario): string {
  if (perfil === "SOLICITANTE") return "/saida";
  if (perfil === "COMPRAS") return "/compras";
  return "/";
}

export default function LoginPage() {
  const router = useRouter();
  const { tema, alternarTema } = useTema();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function autenticar(credenciais: { email: string; senha: string }, destino?: string) {
    setCarregando(true);
    try {
      const sessao = await api<Sessao>("/auth/login", {
        method: "POST",
        body: JSON.stringify(credenciais),
      });
      salvarSessao(sessao);
      toast.success(`Bem-vindo(a), ${sessao.usuario.nome}!`);
      router.push(destino ?? destinoPadrao(sessao.usuario.perfil));
    } catch (e) {
      toast.error(mensagemDeErro(e));
    } finally {
      setCarregando(false);
    }
  }

  function aoSubmeter(e: React.FormEvent) {
    e.preventDefault();
    autenticar({ email, senha });
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="mb-4 flex w-full max-w-2xl items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sistema de Estoque</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Entre com sua conta ou escolha um perfil abaixo para testar as permissões
          </p>
        </div>
        <button
          type="button"
          onClick={alternarTema}
          className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Tema: {tema === "escuro" ? "Escuro" : "Claro"}
        </button>
      </div>

      <div className="grid w-full max-w-2xl gap-6 md:grid-cols-2">
        {/* Formulário de login */}
        <form
          onSubmit={aoSubmeter}
          className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Acesso com credenciais</h2>
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@estoque.local"
                className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-blue-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus-visible:outline-blue-400"
              />
            </div>

            <div>
              <label htmlFor="senha" className="mb-1.5 block text-sm font-medium">
                Senha
              </label>
              <input
                id="senha"
                type="password"
                required
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="••••••"
                className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-blue-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus-visible:outline-blue-400"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={carregando}
            className="mt-6 h-11 w-full rounded-lg bg-blue-700 font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            {carregando ? "Entrando..." : "Entrar"}
          </button>
        </form>

        {/* Acesso rápido de demonstração */}
        <section
          aria-label="Perfis de demonstração"
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900"
        >
          <h2 className="mb-1 text-lg font-semibold">Entrar com 1 clique</h2>
          <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
            Clique em um perfil para entrar diretamente (senha padrão: <code className="font-mono">123456</code>):
          </p>

          <div className="space-y-2.5">
            {CONTAS_DEMO.map((c) => {
              const info = ROTULO_PERFIL[c.perfil];
              return (
                <button
                  key={c.perfil}
                  type="button"
                  disabled={carregando}
                  onClick={() => {
                    setEmail(c.email);
                    setSenha(c.senha);
                    autenticar({ email: c.email, senha: c.senha }, c.destino);
                  }}
                  className="flex w-full flex-col items-start gap-1 rounded-lg border border-slate-200 p-3 text-left transition-colors hover:border-blue-500 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-800 dark:hover:border-blue-500 dark:hover:bg-slate-800/70"
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{c.nome}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${info.cor}`}>{info.nome}</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">{info.descricao}</p>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}


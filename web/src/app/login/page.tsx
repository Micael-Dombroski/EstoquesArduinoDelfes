"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTema } from "@/app/providers";
import { api } from "@/lib/api";
import { ROTULO_PERFIL, salvarSessao, type Sessao } from "@/lib/auth";
import { mensagemDeErro } from "@/lib/errors";
import type { PerfilUsuario } from "@/lib/types";

const CHAVE_OCULTAR_LOGIN_RAPIDO = "estoque:ocultar_login_rapido";
const CHAVE_CONTAS_RAPIDAS = "estoque:contas_login_rapido_v1";

type ContaLoginRapido = {
  perfil: PerfilUsuario;
  nome: string;
  email: string;
  senha: string;
};

const CONTAS_INICIAIS: ContaLoginRapido[] = [
  {
    perfil: "ALMOXARIFADO",
    nome: "Carlos Eduardo Rocha",
    email: "almoxarifado@estoque.local",
    senha: "123456",
  },
  {
    perfil: "COMPRAS",
    nome: "Paula Ribeiro",
    email: "compras@estoque.local",
    senha: "123456",
  },
  {
    perfil: "SUPERVISOR",
    nome: "Roberto Nunes",
    email: "supervisor@estoque.local",
    senha: "123456",
  },
  {
    perfil: "SOLICITANTE",
    nome: "Ana Beatriz Lima",
    email: "solicitante@estoque.local",
    senha: "123456",
  },
];

function destinoPadrao(perfil: PerfilUsuario): string {
  if (perfil === "SOLICITANTE") return "/saida";
  if (perfil === "COMPRAS") return "/pedidos";
  return "/";
}

function carregarContasSalvas(): ContaLoginRapido[] {
  if (typeof window === "undefined") return CONTAS_INICIAIS;
  try {
    const salvo = window.localStorage.getItem(CHAVE_CONTAS_RAPIDAS);
    if (!salvo) return CONTAS_INICIAIS;
    const parsed = JSON.parse(salvo);
    return Array.isArray(parsed) ? (parsed as ContaLoginRapido[]) : CONTAS_INICIAIS;
  } catch {
    return CONTAS_INICIAIS;
  }
}

export default function LoginPage() {
  const router = useRouter();
  const { tema, alternarTema } = useTema();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);

  const [loginRapidoOculto, setLoginRapidoOculto] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(CHAVE_OCULTAR_LOGIN_RAPIDO) === "true";
  });

  const [contasRapidas, setContasRapidas] = useState<ContaLoginRapido[]>(carregarContasSalvas);

  // Estado do prompt "Salvar no login rápido?" após autenticar com uma conta ainda não salva
  const [pendenteSalvar, setPendenteSalvar] = useState<{
    sessao: Sessao;
    senhaDigitada: string;
    destino: string;
  } | null>(null);

  const exibirPainelRapido = !loginRapidoOculto && contasRapidas.length > 0;

  function persistirContas(novas: ContaLoginRapido[]) {
    setContasRapidas(novas);
    window.localStorage.setItem(CHAVE_CONTAS_RAPIDAS, JSON.stringify(novas));
  }

  function removerPainelLoginRapido() {
    setLoginRapidoOculto(true);
    persistirContas([]);
    window.localStorage.setItem(CHAVE_OCULTAR_LOGIN_RAPIDO, "true");
  }

  function removerContaRapida(emailAlvo: string) {
    const novas = contasRapidas.filter(
      (c) => c.email.toLowerCase() !== emailAlvo.toLowerCase(),
    );
    persistirContas(novas);
  }

  function finalizarNavegacao(sessao: Sessao, destino: string) {
    toast.success(`Bem-vindo(a), ${sessao.usuario.nome}!`);
    router.push(destino);
  }

  function confirmarSalvarLoginRapido() {
    if (!pendenteSalvar) return;
    const { sessao, senhaDigitada, destino } = pendenteSalvar;
    const emailNorm = sessao.usuario.email.toLowerCase();

    const novaConta: ContaLoginRapido = {
      perfil: sessao.usuario.perfil,
      nome: sessao.usuario.nome,
      email: sessao.usuario.email,
      senha: senhaDigitada,
    };

    const semDuplicata = contasRapidas.filter((c) => c.email.toLowerCase() !== emailNorm);
    persistirContas([...semDuplicata, novaConta]);
    setLoginRapidoOculto(false);
    window.localStorage.removeItem(CHAVE_OCULTAR_LOGIN_RAPIDO);

    toast.success(`Login rápido salvo para ${sessao.usuario.nome}!`);
    setPendenteSalvar(null);
    router.push(destino);
  }

  function recusarSalvarLoginRapido() {
    if (!pendenteSalvar) return;
    const { sessao, destino } = pendenteSalvar;
    setPendenteSalvar(null);
    finalizarNavegacao(sessao, destino);
  }

  async function autenticar(
    credenciais: { email: string; senha: string },
    opcoes?: { destino?: string; origemRapida?: boolean },
  ) {
    setCarregando(true);
    try {
      const sessao = await api<Sessao>("/auth/login", {
        method: "POST",
        body: JSON.stringify(credenciais),
      });
      salvarSessao(sessao);

      const destino = opcoes?.destino ?? destinoPadrao(sessao.usuario.perfil);
      const emailNorm = sessao.usuario.email.toLowerCase();
      const jaSalvo =
        !loginRapidoOculto &&
        contasRapidas.some(
          (c) => c.email.toLowerCase() === emailNorm && c.senha === credenciais.senha,
        );

      // Se entrou digitando credenciais e este login ainda não está salvo no login rápido, pergunta se deseja salvar
      if (!opcoes?.origemRapida && !jaSalvo) {
        setPendenteSalvar({
          sessao,
          senhaDigitada: credenciais.senha,
          destino,
        });
        return;
      }

      finalizarNavegacao(sessao, destino);
    } catch (e) {
      toast.error(mensagemDeErro(e));
    } finally {
      setCarregando(false);
    }
  }

  function aoSubmeter(e: React.FormEvent) {
    e.preventDefault();
    autenticar({ email, senha }, { origemRapida: false });
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div
        className={`mb-4 flex w-full items-center justify-between gap-3 ${
          exibirPainelRapido ? "max-w-2xl" : "max-w-md"
        }`}
      >
        <div>
          <h1 className="text-2xl font-bold">Sistema de Estoque</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {exibirPainelRapido
              ? "Entre com sua conta ou escolha um acesso salvo ao lado"
              : "Entre com seu e-mail e senha para acessar o sistema"}
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

      <div
        className={`grid w-full gap-6 ${
          exibirPainelRapido ? "max-w-2xl md:grid-cols-2" : "max-w-md grid-cols-1"
        }`}
      >
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

        {/* Acesso rápido */}
        {exibirPainelRapido && (
          <section
            aria-label="Acessos rápidos salvos"
            className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Entrar com 1 clique</h2>
              <button
                type="button"
                onClick={removerPainelLoginRapido}
                className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-red-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-red-400"
                title="Remover todos os logins rápidos"
              >
                Remover login rápido
              </button>
            </div>
            <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
              Clique em uma conta salva para entrar diretamente ou remova no <strong>✕</strong>:
            </p>

            <div className="space-y-2.5">
              {contasRapidas.map((c) => {
                const info = ROTULO_PERFIL[c.perfil];
                return (
                  <div
                    key={c.email}
                    className="group relative flex items-start rounded-lg border border-slate-200 transition-colors hover:border-blue-500 hover:bg-slate-50 dark:border-slate-800 dark:hover:border-blue-500 dark:hover:bg-slate-800/70"
                  >
                    <button
                      type="button"
                      disabled={carregando}
                      onClick={() => {
                        setEmail(c.email);
                        setSenha(c.senha);
                        autenticar(
                          { email: c.email, senha: c.senha },
                          { destino: destinoPadrao(c.perfil), origemRapida: true },
                        );
                      }}
                      className="flex flex-1 flex-col items-start gap-1 p-3 pr-9 text-left disabled:opacity-60"
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="text-sm font-semibold">{c.nome}</span>
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${info.cor}`}>
                          {info.nome}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{c.email}</p>
                      <p className="text-xs text-slate-600 dark:text-slate-400">{info.descricao}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => removerContaRapida(c.email)}
                      aria-label={`Remover login rápido de ${c.nome}`}
                      title={`Remover ${c.nome} do login rápido`}
                      className="absolute top-2.5 right-2 flex size-6 items-center justify-center rounded-md text-xs text-slate-400 hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-950/60 dark:hover:text-red-400"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {/* Modal de confirmação para salvar a conta no Login Rápido caso ainda não esteja salva */}
      {pendenteSalvar && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-salvar-login"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 id="titulo-salvar-login" className="text-lg font-semibold">
                Salvar no login rápido?
              </h3>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  ROTULO_PERFIL[pendenteSalvar.sessao.usuario.perfil].cor
                }`}
              >
                {ROTULO_PERFIL[pendenteSalvar.sessao.usuario.perfil].nome}
              </span>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-400">
              A conta de <strong>{pendenteSalvar.sessao.usuario.nome}</strong> (
              <span className="font-mono text-xs">{pendenteSalvar.sessao.usuario.email}</span>) ainda
              não está salva no acesso rápido. Deseja salvá-la para entrar com 1 clique nas próximas
              vezes?
            </p>

            <div className="mt-6 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={recusarSalvarLoginRapido}
                className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Agora não
              </button>
              <button
                type="button"
                autoFocus
                onClick={confirmarSalvarLoginRapido}
                className="h-10 rounded-lg bg-blue-700 px-4 text-sm font-medium text-white hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                Salvar login rápido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

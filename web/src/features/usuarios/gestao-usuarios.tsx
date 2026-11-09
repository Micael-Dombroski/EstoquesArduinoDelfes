"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { ROTULO_PERFIL, podeGerenciarUsuarios, salvarSessao, useSessao } from "@/lib/auth";
import { mensagemDeErro } from "@/lib/errors";
import { fmtDataHora, normaliza } from "@/lib/format";
import { useRequisitantes, useUsuarios } from "@/lib/hooks";
import type { PerfilUsuario, Usuario } from "@/lib/types";

const PERFIS_ORDEM: PerfilUsuario[] = ["SOLICITANTE", "ALMOXARIFADO", "COMPRAS", "SUPERVISOR"];

type FormUsuario = {
  nome: string;
  email: string;
  senha: string;
  perfil: PerfilUsuario;
  requisitanteId: string;
  criarRequisitanteAutomatico: boolean;
  setorRequisitante: string;
  ativo: boolean;
};

const FORM_INICIAL: FormUsuario = {
  nome: "",
  email: "",
  senha: "",
  perfil: "SOLICITANTE",
  requisitanteId: "",
  criarRequisitanteAutomatico: true,
  setorRequisitante: "",
  ativo: true,
};

const campo =
  "h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-blue-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus-visible:outline-blue-400";

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "U";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
}

export function GestaoUsuarios() {
  const qc = useQueryClient();
  const { sessao, usuario: usuarioLogado } = useSessao();
  const permitido = podeGerenciarUsuarios(usuarioLogado?.perfil);

  const { data: usuarios = [], isLoading, isError, error } = useUsuarios(permitido);
  const { data: requisitantes = [] } = useRequisitantes();

  const formRef = useRef<HTMLFormElement>(null);

  // Filtros da listagem
  const [busca, setBusca] = useState("");
  const [filtroPerfil, setFiltroPerfil] = useState<PerfilUsuario | "TODOS">("TODOS");
  const [filtroStatus, setFiltroStatus] = useState<"TODOS" | "ATIVOS" | "INATIVOS">("TODOS");

  // Estado do formulário (criação / edição)
  const [formAberto, setFormAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState<FormUsuario>(FORM_INICIAL);
  const [mostrarSenha, setMostrarSenha] = useState(false);

  // Estado de confirmação de exclusão inline
  const [confirmandoExclusaoId, setConfirmandoExclusaoId] = useState<number | null>(null);

  // Estatísticas para os cards de resumo
  const estatisticas = useMemo(() => {
    const porPerfil: Record<PerfilUsuario, number> = {
      SOLICITANTE: 0,
      ALMOXARIFADO: 0,
      COMPRAS: 0,
      SUPERVISOR: 0,
    };
    let ativos = 0;
    let inativos = 0;

    for (const u of usuarios) {
      if (u.ativo !== false) ativos++;
      else inativos++;
      if (porPerfil[u.perfil] !== undefined) porPerfil[u.perfil]++;
    }

    return { total: usuarios.length, ativos, inativos, porPerfil };
  }, [usuarios]);

  const usuariosFiltrados = useMemo(() => {
    const termo = normaliza(busca);
    return usuarios.filter((u) => {
      if (filtroPerfil !== "TODOS" && u.perfil !== filtroPerfil) return false;
      if (filtroStatus === "ATIVOS" && u.ativo === false) return false;
      if (filtroStatus === "INATIVOS" && u.ativo !== false) return false;
      if (!termo) return true;
      const nomeMatch = normaliza(u.nome).includes(termo);
      const emailMatch = normaliza(u.email).includes(termo);
      const reqMatch = normaliza(u.requisitante?.nome ?? "").includes(termo);
      const setorMatch = normaliza(u.requisitante?.setor ?? "").includes(termo);
      return nomeMatch || emailMatch || reqMatch || setorMatch;
    });
  }, [usuarios, busca, filtroPerfil, filtroStatus]);

  function abrirCriacao() {
    setEditandoId(null);
    setForm(FORM_INICIAL);
    setMostrarSenha(false);
    setFormAberto(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
  }

  function abrirEdicao(u: Usuario) {
    setEditandoId(u.id);
    setForm({
      nome: u.nome,
      email: u.email,
      senha: "",
      perfil: u.perfil,
      requisitanteId: u.requisitanteId ? String(u.requisitanteId) : "",
      criarRequisitanteAutomatico: false,
      setorRequisitante: "",
      ativo: u.ativo !== false,
    });
    setMostrarSenha(false);
    setFormAberto(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
  }

  function fecharForm() {
    setFormAberto(false);
    setEditandoId(null);
    setForm(FORM_INICIAL);
  }

  const salvarMutation = useMutation({
    mutationFn: async () => {
      if (editandoId !== null) {
        return api<{ data: Usuario }>(`/usuarios/${editandoId}`, {
          method: "PATCH",
          body: JSON.stringify({
            nome: form.nome.trim(),
            email: form.email.trim(),
            ...(form.senha.trim() ? { senha: form.senha.trim() } : {}),
            perfil: form.perfil,
            requisitanteId: form.requisitanteId ? Number(form.requisitanteId) : null,
            ativo: form.ativo,
          }),
        });
      }

      return api<{ data: Usuario }>("/usuarios", {
        method: "POST",
        body: JSON.stringify({
          nome: form.nome.trim(),
          email: form.email.trim(),
          senha: form.senha,
          perfil: form.perfil,
          requisitanteId: form.requisitanteId ? Number(form.requisitanteId) : null,
          criarRequisitanteAutomatico: !form.requisitanteId && form.criarRequisitanteAutomatico,
          setorRequisitante: form.setorRequisitante.trim() || null,
          ativo: form.ativo,
        }),
      });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["usuarios"] });
      qc.invalidateQueries({ queryKey: ["requisitantes"] });

      const atualizado = res?.data;
      if (editandoId !== null && atualizado && sessao && usuarioLogado?.id === atualizado.id) {
        salvarSessao({
          ...sessao,
          usuario: {
            ...usuarioLogado,
            nome: atualizado.nome,
            email: atualizado.email,
            perfil: atualizado.perfil,
            requisitanteId: atualizado.requisitanteId,
          },
        });
      }

      toast.success(editandoId !== null ? "Usuário atualizado com sucesso!" : "Novo usuário cadastrado com sucesso!");
      fecharForm();
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const alternarAtivoMutation = useMutation({
    mutationFn: ({ id, ativo }: { id: number; ativo: boolean }) =>
      api(`/usuarios/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ ativo }),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["usuarios"] });
      toast.success(vars.ativo ? "Conta de usuário reativada." : "Conta de usuário desativada.");
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const excluirMutation = useMutation({
    mutationFn: (id: number) =>
      api(`/usuarios/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      setConfirmandoExclusaoId(null);
      qc.invalidateQueries({ queryKey: ["usuarios"] });
      toast.success("Usuário excluído permanentemente.");
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  function submeterFormulario(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome.trim() || form.nome.trim().length < 2) {
      toast.error("Informe o nome completo do usuário (mínimo 2 caracteres).");
      return;
    }
    if (!form.email.trim()) {
      toast.error("Informe o e-mail de acesso do usuário.");
      return;
    }
    if (editandoId === null && form.senha.length < 6) {
      toast.error("Defina uma senha inicial com pelo menos 6 caracteres.");
      return;
    }
    if (editandoId !== null && form.senha.trim() !== "" && form.senha.trim().length < 6) {
      toast.error("A nova senha deve ter pelo menos 6 caracteres.");
      return;
    }
    salvarMutation.mutate();
  }

  if (!permitido) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
        Acesso restrito: apenas usuários com perfil <strong>Supervisor</strong> podem gerenciar contas e permissões.
      </p>
    );
  }

  const editandoProprioUsuario = editandoId !== null && editandoId === usuarioLogado?.id;

  return (
    <div className="space-y-6">
      {/* Cards de resumo e filtro rápido por perfil */}
      <section aria-label="Resumo de usuários por perfil" className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <button
          type="button"
          onClick={() => setFiltroPerfil("TODOS")}
          className={`rounded-xl border p-3.5 text-left transition-colors ${
            filtroPerfil === "TODOS"
              ? "border-blue-600 bg-blue-50/70 dark:border-blue-500 dark:bg-blue-950/40"
              : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/60"
          }`}
        >
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total de contas</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{estatisticas.total}</p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            {estatisticas.ativos} ativos · {estatisticas.inativos} inativos
          </p>
        </button>

        {PERFIS_ORDEM.map((p) => {
          const info = ROTULO_PERFIL[p];
          const selecionado = filtroPerfil === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => setFiltroPerfil(selecionado ? "TODOS" : p)}
              className={`rounded-xl border p-3.5 text-left transition-colors ${
                selecionado
                  ? "border-blue-600 bg-blue-50/70 dark:border-blue-500 dark:bg-blue-950/40"
                  : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/60"
              }`}
            >
              <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${info.cor}`}>
                {info.nome}
              </span>
              <p className="mt-1.5 text-2xl font-bold tabular-nums">{estatisticas.porPerfil[p]}</p>
            </button>
          );
        })}
      </section>

      {/* Barra de busca, filtro de status e botão Novo Usuário */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, e-mail ou setor..."
            aria-label="Buscar usuário"
            className={campo}
          />
          <select
            aria-label="Filtrar por status da conta"
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value as "TODOS" | "ATIVOS" | "INATIVOS")}
            className="h-11 shrink-0 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 sm:w-40"
          >
            <option value="TODOS">Todos os status</option>
            <option value="ATIVOS">Somente ativos</option>
            <option value="INATIVOS">Somente inativos</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() => (formAberto && editandoId === null ? fecharForm() : abrirCriacao())}
          className="h-11 shrink-0 rounded-lg bg-blue-700 px-5 text-sm font-medium text-white hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500"
        >
          {formAberto && editandoId === null ? "Fechar formulário" : "+ Novo usuário"}
        </button>
      </div>

      {/* Formulário de Criação / Edição de Usuário */}
      {formAberto && (
        <form
          ref={formRef}
          onSubmit={submeterFormulario}
          className="space-y-4 rounded-xl border border-blue-200 bg-white p-5 shadow-sm dark:border-blue-900/60 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {editandoId !== null ? `Editar usuário #${editandoId}` : "Cadastrar novo usuário"}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {editandoId !== null
                  ? "Altere dados cadastrais, nível de permissão ou redefina a senha de acesso."
                  : "Defina o perfil de acesso e vincule o usuário a um funcionário/setor."}
              </p>
            </div>
            <button
              type="button"
              onClick={fecharForm}
              className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="u-nome" className="mb-1.5 block text-sm font-medium">
                Nome completo
              </label>
              <input
                id="u-nome"
                type="text"
                required
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                placeholder="Ex.: Lucas Ferreira"
                className={campo}
              />
            </div>

            <div>
              <label htmlFor="u-email" className="mb-1.5 block text-sm font-medium">
                E-mail de acesso (login)
              </label>
              <input
                id="u-email"
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="Ex.: lucas@estoque.local"
                className={campo}
              />
            </div>

            <div>
              <label htmlFor="u-perfil" className="mb-1.5 block text-sm font-medium">
                Nível de permissão (Perfil)
              </label>
              <select
                id="u-perfil"
                disabled={editandoProprioUsuario}
                value={form.perfil}
                onChange={(e) => setForm((f) => ({ ...f, perfil: e.target.value as PerfilUsuario }))}
                className={`${campo} disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {PERFIS_ORDEM.map((p) => (
                  <option key={p} value={p}>
                    {ROTULO_PERFIL[p].nome} ({p})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {ROTULO_PERFIL[form.perfil].descricao}
              </p>
            </div>

            <div>
              <label htmlFor="u-senha" className="mb-1.5 block text-sm font-medium">
                {editandoId !== null ? "Nova senha (opcional)" : "Senha inicial"}
              </label>
              <div className="flex gap-2">
                <input
                  id="u-senha"
                  type={mostrarSenha ? "text" : "password"}
                  required={editandoId === null}
                  minLength={6}
                  value={form.senha}
                  onChange={(e) => setForm((f) => ({ ...f, senha: e.target.value }))}
                  placeholder={
                    editandoId !== null ? "Deixe em branco para manter a atual" : "Mínimo de 6 caracteres"
                  }
                  className={campo}
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha((v) => !v)}
                  className="h-11 shrink-0 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  {mostrarSenha ? "Ocultar" : "Mostrar"}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="u-requisitante" className="mb-1.5 block text-sm font-medium">
                Funcionário / Destinatário vinculado
              </label>
              <select
                id="u-requisitante"
                value={form.requisitanteId}
                onChange={(e) => setForm((f) => ({ ...f, requisitanteId: e.target.value }))}
                className={campo}
              >
                <option value="">
                  {editandoId === null && form.criarRequisitanteAutomatico
                    ? "Criar automaticamente com o nome deste usuário"
                    : "Sem vínculo com funcionário/destinatário"}
                </option>
                {requisitantes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nome}
                    {r.setor ? ` (${r.setor})` : ""}
                  </option>
                ))}
              </select>
            </div>

            {editandoId === null && !form.requisitanteId ? (
              <div>
                <label htmlFor="u-setor" className="mb-1.5 block text-sm font-medium">
                  Setor do funcionário (para cadastro automático)
                </label>
                <input
                  id="u-setor"
                  type="text"
                  disabled={!form.criarRequisitanteAutomatico}
                  value={form.setorRequisitante}
                  onChange={(e) => setForm((f) => ({ ...f, setorRequisitante: e.target.value }))}
                  placeholder="Ex.: Prototipagem, Manutenção, Compras..."
                  className={`${campo} disabled:opacity-50`}
                />
              </div>
            ) : (
              <div className="flex items-end pb-2">
                <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium">
                  <input
                    type="checkbox"
                    disabled={editandoProprioUsuario}
                    checked={form.ativo}
                    onChange={(e) => setForm((f) => ({ ...f, ativo: e.target.checked }))}
                    className="size-4 accent-blue-600"
                  />
                  Conta ativa (permite fazer login no sistema)
                </label>
              </div>
            )}
          </div>

          {editandoId === null && !form.requisitanteId && (
            <div className="flex flex-wrap items-center gap-6 pt-1 text-sm">
              <label className="flex cursor-pointer items-center gap-2 font-medium text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={form.criarRequisitanteAutomatico}
                  onChange={(e) => setForm((f) => ({ ...f, criarRequisitanteAutomatico: e.target.checked }))}
                  className="size-4 accent-blue-600"
                />
                Criar automaticamente na lista de funcionários/destinatários de materiais
              </label>

              <label className="flex cursor-pointer items-center gap-2 font-medium text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={form.ativo}
                  onChange={(e) => setForm((f) => ({ ...f, ativo: e.target.checked }))}
                  className="size-4 accent-blue-600"
                />
                Conta ativa
              </label>
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
            <button
              type="button"
              onClick={fecharForm}
              className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvarMutation.isPending}
              className="h-10 rounded-lg bg-blue-700 px-5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              {salvarMutation.isPending
                ? "Salvando..."
                : editandoId !== null
                  ? "Salvar alterações"
                  : "Criar usuário"}
            </button>
          </div>
        </form>
      )}

      {/* Lista de usuários */}
      {isLoading ? (
        <div className="h-48 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
      ) : isError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          {mensagemDeErro(error)}
        </p>
      ) : usuariosFiltrados.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-600 dark:border-slate-700 dark:text-slate-400">
          Nenhum usuário encontrado com os filtros selecionados.
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-xs dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {usuariosFiltrados.map((u) => {
            const infoPerfil = ROTULO_PERFIL[u.perfil];
            const ativo = u.ativo !== false;
            const ehLogado = u.id === usuarioLogado?.id;
            const confirmandoExclusao = confirmandoExclusaoId === u.id;

            return (
              <li
                key={u.id}
                className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between ${
                  !ativo ? "bg-slate-50/70 opacity-75 dark:bg-slate-950/40" : ""
                }`}
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {iniciais(u.nome)}
                  </div>

                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{u.nome}</p>
                      {ehLogado && (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800 dark:bg-blue-950/80 dark:text-blue-300">
                          Sua conta
                        </span>
                      )}
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${infoPerfil.cor}`}>
                        {infoPerfil.nome}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          ativo
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300"
                            : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-400"
                        }`}
                      >
                        {ativo ? "Ativo" : "Inativo"}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      <span className="font-mono">{u.email}</span>
                      {u.requisitante && (
                        <span>
                          {" "}
                          · Funcionário vinculado: <strong>{u.requisitante.nome}</strong>
                          {u.requisitante.setor ? ` (${u.requisitante.setor})` : ""}
                        </span>
                      )}
                      {u.criadoEm && <span> · Criado em {fmtDataHora(u.criadoEm)}</span>}
                    </p>
                  </div>
                </div>

                {/* Ações da linha */}
                <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                  {confirmandoExclusao ? (
                    <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 dark:border-red-900/60 dark:bg-red-950/40">
                      <span className="text-xs font-medium text-red-800 dark:text-red-300">Excluir conta?</span>
                      <button
                        type="button"
                        disabled={excluirMutation.isPending}
                        onClick={() => excluirMutation.mutate(u.id)}
                        className="h-8 rounded-md bg-red-700 px-2.5 text-xs font-medium text-white hover:bg-red-800 disabled:opacity-50"
                      >
                        Confirmar
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmandoExclusaoId(null)}
                        className="h-8 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      >
                        Não
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => abrirEdicao(u)}
                        className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                      >
                        Editar
                      </button>

                      {!ehLogado && (
                        <>
                          <button
                            type="button"
                            disabled={alternarAtivoMutation.isPending}
                            onClick={() => alternarAtivoMutation.mutate({ id: u.id, ativo: !ativo })}
                            className={`h-9 rounded-lg border px-3 text-xs font-medium ${
                              ativo
                                ? "border-amber-300 bg-amber-50/60 text-amber-900 hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-950/60"
                                : "border-emerald-300 bg-emerald-50/60 text-emerald-900 hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-950/60"
                            }`}
                          >
                            {ativo ? "Desativar" : "Reativar"}
                          </button>

                          <button
                            type="button"
                            onClick={() => setConfirmandoExclusaoId(u.id)}
                            className="h-9 rounded-lg border border-red-200 px-3 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/50"
                          >
                            Excluir
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

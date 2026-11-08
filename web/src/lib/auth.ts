"use client";

import { useSyncExternalStore } from "react";
import type { PerfilUsuario, Usuario } from "./types";

const CHAVE_SESSAO = "estoque:sessao";
const EVENTO_SESSAO = "estoque:sessao-change";

export type Sessao = {
  token: string;
  usuario: Usuario;
};

export const ROTULO_PERFIL: Record<PerfilUsuario, { nome: string; descricao: string; cor: string }> = {
  SOLICITANTE: {
    nome: "Solicitante",
    descricao: "Retira materiais do estoque e consulta catálogo de produtos",
    cor: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
  },
  ALMOXARIFADO: {
    nome: "Almoxarifado",
    descricao: "Cria solicitações de compra, recebe mercadorias e gerencia retiradas",
    cor: "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300",
  },
  COMPRAS: {
    nome: "Setor de Compras",
    descricao: "Revisa solicitações do almoxarifado, ajusta itens/preços e aprova envio ao fornecedor",
    cor: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  },
  SUPERVISOR: {
    nome: "Supervisor",
    descricao: "Revisa e aprova solicitações de compra e possui acesso completo ao sistema",
    cor: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  },
};

export function podeSolicitarCompra(perfil?: PerfilUsuario | null): boolean {
  return perfil === "ALMOXARIFADO" || perfil === "COMPRAS" || perfil === "SUPERVISOR";
}

export function podeRevisarCompra(perfil?: PerfilUsuario | null): boolean {
  return perfil === "COMPRAS" || perfil === "SUPERVISOR";
}

export function podeReceberCompra(perfil?: PerfilUsuario | null): boolean {
  return perfil === "ALMOXARIFADO" || perfil === "SUPERVISOR";
}

export function podeDesfazerRetirada(perfil?: PerfilUsuario | null): boolean {
  return perfil === "ALMOXARIFADO" || perfil === "SUPERVISOR";
}

export function podeCadastrarFornecedor(perfil?: PerfilUsuario | null): boolean {
  return perfil === "SUPERVISOR";
}

export function podeVerFornecedores(perfil?: PerfilUsuario | null): boolean {
  return perfil === "ALMOXARIFADO" || perfil === "COMPRAS" || perfil === "SUPERVISOR";
}

let cacheBruto: string | null = null;
let cacheSessao: Sessao | null = null;

export function lerSessao(): Sessao | null {
  if (typeof window === "undefined") return null;
  try {
    const bruto = localStorage.getItem(CHAVE_SESSAO);
    if (bruto === cacheBruto) return cacheSessao;
    cacheBruto = bruto;
    cacheSessao = bruto ? (JSON.parse(bruto) as Sessao) : null;
    return cacheSessao;
  } catch {
    return null;
  }
}

export function lerToken(): string | null {
  return lerSessao()?.token ?? null;
}

export function salvarSessao(sessao: Sessao) {
  try {
    const bruto = JSON.stringify(sessao);
    localStorage.setItem(CHAVE_SESSAO, bruto);
    cacheBruto = bruto;
    cacheSessao = sessao;
  } catch {}
  window.dispatchEvent(new Event(EVENTO_SESSAO));
}

export function limparSessao() {
  try {
    localStorage.removeItem(CHAVE_SESSAO);
    cacheBruto = null;
    cacheSessao = null;
  } catch {}
  window.dispatchEvent(new Event(EVENTO_SESSAO));
}

function inscreverSessao(callback: () => void) {
  window.addEventListener(EVENTO_SESSAO, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENTO_SESSAO, callback);
    window.removeEventListener("storage", callback);
  };
}

function lerSessaoServidor(): Sessao | null {
  return null;
}

export function useSessao() {
  const sessao = useSyncExternalStore(inscreverSessao, lerSessao, lerSessaoServidor);
  return {
    sessao,
    usuario: sessao?.usuario ?? null,
    autenticado: sessao !== null,
    salvarSessao,
    limparSessao,
  };
}


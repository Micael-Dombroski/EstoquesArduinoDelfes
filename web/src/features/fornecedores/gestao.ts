import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { normaliza } from "@/lib/format";
import { cnpjValido, soDigitos } from "./cnpj";
import { mascaraCnpj } from "./cnpj";
import { normalizaDinheiro, type Erros } from "./form";

export type VinculoApi = {
  produtoId: number;
  prazoEntregaDias: number;
  precoUnitario: string | null;
  preferencial: boolean;
  produto: { id: number; codigo: string; nome: string; unidade: string };
};

export type FornecedorApi = {
  id: number;
  nome: string;
  cnpj: string | null;
  contato: string | null;
  email: string | null;
  telefone: string | null;
  valorMinimoPedido: string | null;
  ativo: boolean;
  atualizadoEm: string;
  produtos: VinculoApi[];
};

// Versão editável (tudo em texto, como os inputs)
export type Rascunho = {
  nome: string;
  cnpj: string;
  contato: string;
  email: string;
  telefone: string;
  valorMinimo: string;
  produtos: { produtoId: number; prazo: string; preco: string; preferencial: boolean }[];
};

export type Ordem = "az" | "za";

// Chama a API e entrega só o conteúdo de { data }, qualquer que seja o formato do seu api().
export async function chamar<T = unknown>(caminho: string, opcoes?: Parameters<typeof api>[1]): Promise<T> {
  const r: unknown = await api(caminho, opcoes);
  if (r && typeof r === "object" && "data" in r) return (r as { data: T }).data;
  return r as T;
}

export function useFornecedores(ativo: boolean) {
  return useQuery({
    queryKey: ["gestao-fornecedores", ativo],
    queryFn: () => chamar<FornecedorApi[]>(`/gestao-fornecedores?ativo=${ativo}`),
  });
}

export function useAtualizarFornecedor(id: number) {
  return useMutation({
    mutationFn: (corpo: ReturnType<typeof montarCorpoEdicao>) =>
      chamar(`/gestao-fornecedores/${id}`, { method: "PUT", body: JSON.stringify(corpo) }),
  });
}

export function useAlterarAtivo(id: number) {
  return useMutation({
    mutationFn: (ativo: boolean) =>
      chamar(`/gestao-fornecedores/${id}/ativo`, { method: "PATCH", body: JSON.stringify({ ativo }) }),
  });
}

const virgula = (v: string | null) => (v ?? "").replace(".", ",");

export const rascunhoDe = (f: FornecedorApi): Rascunho => ({
  nome: f.nome,
  cnpj: f.cnpj ?? "",
  contato: f.contato ?? "",
  email: f.email ?? "",
  telefone: f.telefone ?? "",
  valorMinimo: virgula(f.valorMinimoPedido),
  produtos: f.produtos.map((p) => ({
    produtoId: p.produtoId,
    prazo: String(p.prazoEntregaDias),
    preco: virgula(p.precoUnitario),
    preferencial: p.preferencial,
  })),
});

// Chaves dos erros: "nome", "cnpj", "email", "telefone", "minimo", "p<produtoId>-prazo", "p<produtoId>-preco"
export function validarEdicao(r: Rascunho): Erros {
  const e: Erros = {};
  if (r.nome.trim().length < 2) e["nome"] = "Informe o nome do fornecedor.";
  if (r.cnpj && !cnpjValido(soDigitos(r.cnpj))) e["cnpj"] = "CNPJ inválido. Confira os 14 dígitos.";
  if (r.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email.trim())) e["email"] = "E-mail inválido.";
  if (r.telefone && soDigitos(r.telefone).length < 10) e["telefone"] = "Telefone incompleto. Use DDD e número.";
  if (r.valorMinimo.trim() && normalizaDinheiro(r.valorMinimo) === null) {
    e["minimo"] = "Valor inválido. Use até 2 casas decimais.";
  }
  for (const p of r.produtos) {
    const prazo = Number(p.prazo);
    if (p.prazo === "" || !Number.isInteger(prazo) || prazo < 0 || prazo > 365) {
      e[`p${p.produtoId}-prazo`] = "Prazo de 0 a 365 dias.";
    }
    if (p.preco.trim() && normalizaDinheiro(p.preco) === null) e[`p${p.produtoId}-preco`] = "Preço inválido.";
  }
  return e;
}

export function montarCorpoEdicao(r: Rascunho) {
  const opcional = (v: string) => v.trim() || undefined;
  return {
    nome: r.nome.trim(),
    cnpj: r.cnpj ? mascaraCnpj(r.cnpj) : undefined,
    contato: opcional(r.contato),
    email: opcional(r.email),
    telefone: opcional(r.telefone),
    valorMinimoPedido: r.valorMinimo.trim() ? (normalizaDinheiro(r.valorMinimo) ?? undefined) : undefined,
    produtos: r.produtos.map((p) => ({
      produtoId: p.produtoId,
      prazoEntregaDias: Number(p.prazo),
      precoUnitario: p.preco.trim() ? (normalizaDinheiro(p.preco) ?? undefined) : undefined,
      preferencial: p.preferencial,
    })),
  };
}

// Busca inteligente: ignora acentos/maiúsculas, aceita várias palavras (todas precisam bater)
// e procura em nome, CNPJ (com ou sem pontuação), contato, e-mail, telefone e nos produtos vinculados.
function palheiro(f: FornecedorApi): string {
  return normaliza(
    [
      f.nome,
      f.cnpj,
      soDigitos(f.cnpj ?? ""),
      f.contato,
      f.email,
      f.telefone,
      soDigitos(f.telefone ?? ""),
      ...f.produtos.flatMap((p) => [p.produto.nome, p.produto.codigo]),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

export function filtrarFornecedores(lista: FornecedorApi[], busca: string, ordem: Ordem): FornecedorApi[] {
  const tokens = normaliza(busca).split(/\s+/).filter(Boolean);
  const filtrados = tokens.length === 0 ? lista : lista.filter((f) => {
    const p = palheiro(f);
    return tokens.every((t) => p.includes(t));
  });
  const dir = ordem === "az" ? 1 : -1;
  return [...filtrados].sort((a, b) => dir * a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
}
import { cnpjValido, mascaraCnpj, soDigitos } from "./cnpj";

export type FormFornecedor = {
  nome: string;
  cnpj: string;
  contato: string;
  email: string;
  telefone: string;
  valorMinimo: string;
};

export type NovoProdutoForm = {
  codigo: string;
  nome: string;
  unidade: string;
  marca: string;
  ponto: string; // ponto de reposição (opcional)
};

export type LinhaProduto = {
  chave: string;
  modo: "existente" | "novo";
  produtoId: number | null; // usado quando modo === "existente"
  novo: NovoProdutoForm; // usado quando modo === "novo"
  prazo: string;
  preco: string;
  preferencial: boolean;
};

// A chave de cada erro é o id do campo, para focar o primeiro com problema.
export type Erros = Record<string, string>;

export const FORM_VAZIO: FormFornecedor = { nome: "", cnpj: "", contato: "", email: "", telefone: "", valorMinimo: "" };
export const NOVO_VAZIO: NovoProdutoForm = { codigo: "", nome: "", unidade: "un", marca: "", ponto: "" };

let seq = 0;
export const novaLinha = (): LinhaProduto => ({
  chave: `l${++seq}`,
  modo: "existente",
  produtoId: null,
  novo: { ...NOVO_VAZIO },
  prazo: "",
  preco: "",
  preferencial: false,
});

// "1.234,56" ou "1234.56" -> "1234.56"; null se inválido (máx. 2 casas, até 10 dígitos inteiros).
export function normalizaDinheiro(texto: string): string | null {
  let t = texto.trim().replace(/^R\$\s*/i, "");
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(t)) return null;
  return Number(t).toFixed(2);
}

// "12,5" ou "12.5" -> "12.5"; null se inválido (máx. 3 casas, até 9 dígitos inteiros).
export function normalizaQuantidade(texto: string): string | null {
  let t = texto.trim();
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  if (!/^\d{1,9}(\.\d{1,3})?$/.test(t)) return null;
  return t;
}

export function validar(f: FormFornecedor, linhas: LinhaProduto[]): Erros {
  const e: Erros = {};
  if (f.nome.trim().length < 2) e["f-nome"] = "Informe o nome do fornecedor.";
  if (f.cnpj && !cnpjValido(soDigitos(f.cnpj))) e["f-cnpj"] = "CNPJ inválido. Confira os 14 dígitos.";
  if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e["f-email"] = "E-mail inválido.";
  if (f.telefone && soDigitos(f.telefone).length < 10) e["f-telefone"] = "Telefone incompleto. Use DDD e número.";
  if (f.valorMinimo.trim() && normalizaDinheiro(f.valorMinimo) === null) {
    e["f-minimo"] = "Valor inválido. Use números com até 2 casas decimais.";
  }
  if (linhas.length === 0) e["produtos"] = "Inclua pelo menos um produto.";

  const codigosVistos = new Set<string>();
  for (const l of linhas) {
    if (l.modo === "existente") {
      if (l.produtoId == null) e[`${l.chave}-produto`] = "Escolha o produto.";
    } else {
      const codigo = l.novo.codigo.trim().toLowerCase();
      if (!codigo) e[`${l.chave}-codigo`] = "Informe o código.";
      else if (codigosVistos.has(codigo)) e[`${l.chave}-codigo`] = "Código repetido na lista.";
      codigosVistos.add(codigo);
      if (l.novo.nome.trim().length < 2) e[`${l.chave}-nome`] = "Informe o nome do produto.";
      if (!l.novo.unidade.trim()) e[`${l.chave}-unidade`] = "Informe a unidade.";
      if (l.novo.ponto.trim() && normalizaQuantidade(l.novo.ponto) === null) {
        e[`${l.chave}-ponto`] = "Quantidade inválida (até 3 casas).";
      }
    }
    const prazo = Number(l.prazo);
    if (l.prazo === "" || !Number.isInteger(prazo) || prazo < 0 || prazo > 365) {
      e[`${l.chave}-prazo`] = "Informe o prazo em dias (de 0 a 365).";
    }
    if (l.preco.trim() && normalizaDinheiro(l.preco) === null) e[`${l.chave}-preco`] = "Preço inválido.";
  }
  return e;
}

// Corpo do POST: campos vazios são omitidos; valores já normalizados.
export function montarCorpo(f: FormFornecedor, linhas: LinhaProduto[]) {
  const opcional = (v: string) => v.trim() || undefined;
  return {
    nome: f.nome.trim(),
    cnpj: f.cnpj ? mascaraCnpj(f.cnpj) : undefined,
    contato: opcional(f.contato),
    email: opcional(f.email),
    telefone: opcional(f.telefone),
    valorMinimoPedido: f.valorMinimo.trim() ? (normalizaDinheiro(f.valorMinimo) ?? undefined) : undefined,
    produtos: linhas.map((l) => ({
      ...(l.modo === "existente"
        ? { produtoId: l.produtoId as number }
        : {
            novoProduto: {
              codigo: l.novo.codigo.trim(),
              nome: l.novo.nome.trim(),
              unidade: l.novo.unidade.trim(),
              marca: opcional(l.novo.marca),
              pontoReposicao: l.novo.ponto.trim() ? (normalizaQuantidade(l.novo.ponto) ?? undefined) : undefined,
            },
          }),
      prazoEntregaDias: Number(l.prazo),
      precoUnitario: l.preco.trim() ? (normalizaDinheiro(l.preco) ?? undefined) : undefined,
      preferencial: l.preferencial,
    })),
  };
}
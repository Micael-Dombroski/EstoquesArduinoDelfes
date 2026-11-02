// Contrato esperado da API. Se algum formato diferir, ajuste SÓ este arquivo
// (e o unwrapList em api.ts). Quantidades chegam como string ("12.500").

export type Produto = {
  id: number;
  codigo: string;
  nome: string;
  unidade: string;
  saldoAtual: string;
  pontoReposicao: string;
  ativo: boolean;
};

export type Requisitante = {
  id: number;
  nome: string;
  setor?: string | null;
  ativo: boolean;
};

export type ItemSugestao = {
  produtoId: number;
  codigo: string;
  nome: string;
  unidade: string;
  saldoAtual: string;
  diasRestantes: number | null;
  qtdSugerida: string;
};

export type GrupoSugestao = {
  fornecedorId: number | null;
  fornecedorNome: string | null;
  itens: ItemSugestao[];
};

// details do erro 422 SALDO_INSUFICIENTE
export type Faltante = { produtoId: number; saldoAtual: string };

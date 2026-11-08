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

// ----- Histórico de retiradas (GET /pedidos-saida) -----
export type ItemRetirada = {
  id: number;
  produtoId: number;
  quantidade: string;
  produto?: { nome: string; unidade: string } | null;
};

export type Retirada = {
  id: number;
  requisitanteId: number;
  requisitante?: { nome: string } | null;
  status: "CONCLUIDO" | "CANCELADO";
  dataPedido: string; // ISO 8601
  observacao?: string | null;
  itens?: ItemRetirada[]; // pode não vir na listagem; nesse caso o front busca o detalhe
};

export type Pagina<T> = { itens: T[]; total: number };

// ----- Autenticação e Perfis -----
export type PerfilUsuario = "SOLICITANTE" | "ALMOXARIFADO" | "COMPRAS" | "SUPERVISOR";

export type Usuario = {
  id: number;
  nome: string;
  email: string;
  perfil: PerfilUsuario;
  requisitanteId: number | null;
};

// ----- Solicitações e Pedidos de Compra (GET /pedidos-entrada) -----
export type StatusPedidoEntrada = "RASCUNHO" | "ENVIADO" | "RECEBIDO_PARCIAL" | "RECEBIDO" | "CANCELADO";
export type StatusRecebimento = "AGUARDANDO_NF" | "CONCLUIDO";

export type ItemPedidoEntrada = {
  id: number;
  pedidoId: number;
  produtoId: number;
  quantidade: string;
  quantidadeRecebida: string;
  marca?: string | null;
  precoUnitario?: string | null;
  produto?: {
    id: number;
    codigo: string;
    nome: string;
    unidade: string;
    marca?: string | null;
  } | null;
};

export type ItemRecebimentoEntrada = {
  id: number;
  recebimentoId: number;
  itemPedidoId: number;
  produtoId: number;
  quantidade: string;
  itemPedido?: {
    id: number;
    produto?: {
      id: number;
      codigo: string;
      nome: string;
      unidade: string;
    } | null;
  } | null;
};

export type RecebimentoEntrada = {
  id: number;
  pedidoId: number;
  status: StatusRecebimento;
  numeroNf?: string | null;
  observacao?: string | null;
  recebidoPorNome?: string | null;
  nfLancadaPorNome?: string | null;
  dataRecebimento: string;
  dataNf?: string | null;
  pedido?: {
    id: number;
    numeroOc?: string | null;
    status: StatusPedidoEntrada;
    fornecedor?: { id: number; nome: string } | null;
  } | null;
  itens: ItemRecebimentoEntrada[];
};

export type PedidoEntrada = {
  id: number;
  fornecedorId: number;
  numeroOc?: string | null;
  status: StatusPedidoEntrada;
  dataPedido: string;
  previsaoEntrega?: string | null;
  dataRecebimento?: string | null;
  observacao?: string | null;
  fornecedor?: {
    id: number;
    nome: string;
    valorMinimoPedido?: string | null;
  } | null;
  itens?: ItemPedidoEntrada[];
  recebimentos?: RecebimentoEntrada[];
};

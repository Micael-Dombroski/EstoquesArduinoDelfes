import { ApiError } from "./api";

// Cada código da API vira uma mensagem que diz o que fazer em seguida.
const MENSAGENS: Record<string, string> = {
  VALIDATION_ERROR: "Alguns dados estão inválidos. Confira os campos e tente de novo.",
  SALDO_INSUFICIENTE: "Saldo insuficiente em um ou mais itens. Reduza a quantidade dos itens em vermelho.",
  EXCEDE_PEDIDO: "A quantidade recebida é maior que a pedida. Corrija o valor.",
  NAO_ESTORNAVEL: "Esta movimentação não pode ser estornada.",
  JA_ESTORNADA: "Esta movimentação já foi estornada.",
  STATUS_INVALIDO: "Esta ação não está disponível para o status atual do pedido.",
  CONFLITO: "Já existe um registro com esses dados.",
  NAO_ENCONTRADO: "Registro não encontrado. Atualize a página e tente de novo.",
  CREDENCIAIS_INVALIDAS: "E-mail ou senha incorretos.",
  NAO_AUTENTICADO: "Faça login para realizar esta operação.",
  TOKEN_INVALIDO: "Sessão inválida. Faça login novamente.",
  TOKEN_EXPIRADO: "Sua sessão expirou. Faça login novamente.",
  SEM_PERMISSAO: "Seu perfil de usuário não tem permissão para realizar esta ação.",
  PEDIDO_SEM_ITENS: "O pedido precisa ter pelo menos um item.",
  CNPJ_DUPLICADO: "Já existe um fornecedor com este CNPJ.",
  CODIGO_DUPLICADO: "Já existe um produto com este código. Use outro código ou escolha o produto na lista.",
  PRODUTO_INVALIDO: "Há produtos inexistentes ou inativos na lista. Atualize a página e escolha de novo.",
};

export function mensagemDeErro(e: unknown): string {
  if (e instanceof ApiError) return MENSAGENS[e.code] ?? e.message;
  return "Não foi possível falar com o servidor. Verifique se a API está rodando.";
}

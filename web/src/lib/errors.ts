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
};

export function mensagemDeErro(e: unknown): string {
  if (e instanceof ApiError) return MENSAGENS[e.code] ?? e.message;
  return "Não foi possível falar com o servidor. Verifique se a API está rodando.";
}

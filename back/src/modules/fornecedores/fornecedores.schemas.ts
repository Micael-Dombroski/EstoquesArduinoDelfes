import { z } from 'zod';
import { paginacaoSchema } from '../../shared/pagination';
import { boolQuery } from '../../shared/schemas';
import { valorNaoNegativo } from '../../shared/decimal';

const campos = {
  nome: z.string().trim().min(1).max(150),
  cnpj: z.string().trim().max(18).nullish(),
  contato: z.string().trim().max(100).nullish(),
  email: z.string().trim().email('E-mail inválido').max(150).or(z.literal('')).nullish(),
  telefone: z.string().trim().max(30).nullish(),
  valorMinimoPedido: valorNaoNegativo.nullish(),
};

export const criarFornecedorSchema = z.object(campos).strict();
export const atualizarFornecedorSchema = z
  .object(campos)
  .partial()
  .extend({ ativo: z.boolean().optional() })
  .strict();

export const listarFornecedoresSchema = paginacaoSchema.extend({
  q: z.string().trim().optional(),
  ativo: boolQuery.optional(),
});

export type CriarFornecedor = z.infer<typeof criarFornecedorSchema>;
export type AtualizarFornecedor = z.infer<typeof atualizarFornecedorSchema>;
export type ListarFornecedores = z.infer<typeof listarFornecedoresSchema>;

import { z } from 'zod';
import { paginacaoSchema } from '../../shared/pagination';
import { boolQuery } from '../../shared/schemas';

const campos = {
  nome: z.string().trim().min(1).max(120),
  setor: z.string().trim().max(80).nullish(),
};

export const criarRequisitanteSchema = z.object(campos).strict();
export const atualizarRequisitanteSchema = z
  .object(campos)
  .partial()
  .extend({ ativo: z.boolean().optional() })
  .strict();

// pageSize padrão maior: a lista alimenta um select/dropdown na tela de saída
export const listarRequisitantesSchema = paginacaoSchema.extend({
  pageSize: z.coerce.number().int().min(1).max(200).default(100),
  q: z.string().trim().optional(),
  ativo: boolQuery.optional(),
});

export type CriarRequisitante = z.infer<typeof criarRequisitanteSchema>;
export type AtualizarRequisitante = z.infer<typeof atualizarRequisitanteSchema>;
export type ListarRequisitantes = z.infer<typeof listarRequisitantesSchema>;

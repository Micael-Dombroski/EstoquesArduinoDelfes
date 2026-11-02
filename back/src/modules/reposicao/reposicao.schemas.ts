import { z } from 'zod';
import { boolQuery } from '../../shared/schemas';
import { quantidadePositiva } from '../../shared/decimal';

export const sugestoesQuerySchema = z.object({
  // sem o parâmetro, o padrão é listar só o que precisa repor
  apenasPrecisaRepor: boolQuery.optional(),
});

export const rascunhoSchema = z
  .object({
    fornecedorId: z.number().int().positive(),
    // sem "itens": usa todos os produtos a repor deste fornecedor, com a quantidade sugerida
    itens: z
      .array(z.object({ produtoId: z.number().int().positive(), quantidade: quantidadePositiva.optional() }).strict())
      .min(1)
      .refine((itens) => new Set(itens.map((i) => i.produtoId)).size === itens.length, 'Produto repetido')
      .optional(),
  })
  .strict();

export type SugestoesQuery = z.infer<typeof sugestoesQuerySchema>;
export type RascunhoBody = z.infer<typeof rascunhoSchema>;

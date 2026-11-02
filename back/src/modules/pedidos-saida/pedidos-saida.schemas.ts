import { z } from 'zod';
import { paginacaoSchema } from '../../shared/pagination';
import { ateQuery, deQuery } from '../../shared/schemas';
import { quantidadePositiva } from '../../shared/decimal';

export const criarSaidaSchema = z
  .object({
    requisitanteId: z.number().int().positive(),
    observacao: z.string().trim().nullish(),
    itens: z
      .array(z.object({ produtoId: z.number().int().positive(), quantidade: quantidadePositiva }).strict())
      .min(1, 'Informe ao menos um item')
      .refine((itens) => new Set(itens.map((i) => i.produtoId)).size === itens.length, 'Produto repetido na lista de itens'),
  })
  .strict();

export const listarSaidasSchema = paginacaoSchema.extend({
  requisitanteId: z.coerce.number().int().positive().optional(),
  status: z.enum(['CONCLUIDO', 'CANCELADO']).optional(),
  de: deQuery.optional(),
  ate: ateQuery.optional(),
});

export type CriarSaida = z.infer<typeof criarSaidaSchema>;
export type ListarSaidas = z.infer<typeof listarSaidasSchema>;

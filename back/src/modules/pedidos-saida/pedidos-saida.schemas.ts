import { z } from 'zod';
import { paginacaoSchema } from '../../shared/pagination';
import { ateQuery, deQuery } from '../../shared/schemas';
import { quantidadeNaoNegativa, quantidadePositiva } from '../../shared/decimal';

export const criarSaidaSchema = z
  .object({
    requisitanteId: z.number().int().positive(),
    observacao: z.string().trim().nullish(),
    pendente: z.boolean().optional(),
    itens: z
      .array(z.object({ produtoId: z.number().int().positive(), quantidade: quantidadePositiva }).strict())
      .min(1, 'Informe ao menos um item')
      .refine((itens) => new Set(itens.map((i) => i.produtoId)).size === itens.length, 'Produto repetido na lista de itens'),
  })
  .strict();

export const situacaoFaltanteSchema = z.enum(['NECESSITA_COMPRA', 'A_CAMINHO']).nullish();

export const itemSeparacaoSchema = z
  .object({
    itemId: z.number().int().positive(),
    separado: z.boolean(),
    quantidadeSeparada: quantidadeNaoNegativa,
    situacaoFaltante: situacaoFaltanteSchema,
  })
  .strict();

export const separarSaidaSchema = z
  .object({
    observacao: z.string().trim().nullish(),
    itens: z.array(itemSeparacaoSchema).min(1, 'Informe ao menos um item da separação'),
  })
  .strict();

export const baixarSaidaSchema = z
  .object({
    observacao: z.string().trim().nullish(),
    itens: z.array(itemSeparacaoSchema).optional(),
  })
  .strict()
  .optional();

export const listarSaidasSchema = paginacaoSchema.extend({
  requisitanteId: z.coerce.number().int().positive().optional(),
  produtoId: z.coerce.number().int().positive().optional(),
  status: z.enum(['PENDENTE', 'CONCLUIDO', 'CANCELADO']).optional(),
  de: deQuery.optional(),
  ate: ateQuery.optional(),
});

export type CriarSaida = z.infer<typeof criarSaidaSchema>;
export type SepararSaida = z.infer<typeof separarSaidaSchema>;
export type BaixarSaida = z.infer<typeof baixarSaidaSchema>;
export type ListarSaidas = z.infer<typeof listarSaidasSchema>;

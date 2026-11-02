import { z } from 'zod';
import { paginacaoSchema } from '../../shared/pagination';
import { ateQuery, deQuery } from '../../shared/schemas';
import { variacaoNaoZero } from '../../shared/decimal';

export const listarMovimentacoesSchema = paginacaoSchema.extend({
  produtoId: z.coerce.number().int().positive().optional(),
  tipo: z.enum(['ENTRADA', 'SAIDA', 'AJUSTE', 'ESTORNO']).optional(),
  de: deQuery.optional(),
  ate: ateQuery.optional(),
});

/** variacao é assinada: positiva soma, negativa subtrai. O motivo é obrigatório (auditoria). */
export const ajusteSchema = z
  .object({
    produtoId: z.number().int().positive(),
    variacao: variacaoNaoZero,
    observacao: z.string().trim().min(3, 'Informe o motivo do ajuste'),
  })
  .strict();

// corpo opcional: POST /:id/estorno pode ser enviado sem body
export const estornoBodySchema = z
  .object({ observacao: z.string().trim().max(500).nullish() })
  .strict()
  .optional();

export type ListarMovimentacoes = z.infer<typeof listarMovimentacoesSchema>;
export type AjusteBody = z.infer<typeof ajusteSchema>;
export type EstornoBody = z.infer<typeof estornoBodySchema>;

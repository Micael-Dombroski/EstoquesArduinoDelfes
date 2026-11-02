import { z } from 'zod';
import { paginacaoSchema } from '../../shared/pagination';

export const situacaoSchema = paginacaoSchema.extend({
  semaforo: z.enum(['VERMELHO', 'AMARELO', 'VERDE']).optional(),
  q: z.string().trim().optional(),
});

export const paradosSchema = paginacaoSchema.extend({
  dias: z.coerce.number().int().min(1).default(30),
});

export type Situacao = z.infer<typeof situacaoSchema>;
export type Parados = z.infer<typeof paradosSchema>;

import { z } from 'zod';

export const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
export type IdParam = z.infer<typeof idParamSchema>;

/** Query string "true"/"false" -> boolean (z.coerce.boolean() trataria "false" como true). */
export const boolQuery = z.enum(['true', 'false']).transform((v) => v === 'true');

const dataValida = (d: Date) => !Number.isNaN(d.getTime());

/** "2026-10-01" ou ISO completo. */
export const deQuery = z
  .string()
  .transform((s) => new Date(s))
  .refine(dataValida, 'Data inválida');

/** Se vier só a data (YYYY-MM-DD), vai até o fim do dia. */
export const ateQuery = z
  .string()
  .transform((s) => (s.length === 10 ? new Date(`${s}T23:59:59.999Z`) : new Date(s)))
  .refine(dataValida, 'Data inválida');

/** Filtro de período do Prisma (ou undefined se nenhum limite foi informado). */
export const intervalo = (de?: Date, ate?: Date) =>
  de || ate ? { ...(de ? { gte: de } : {}), ...(ate ? { lte: ate } : {}) } : undefined;

/** Troca '' por null (evita violar unique em campos opcionais como CNPJ). */
export const vazioParaNulo = <T extends Record<string, unknown>>(dados: T): T =>
  Object.fromEntries(Object.entries(dados).map(([k, v]) => [k, v === '' ? null : v])) as T;

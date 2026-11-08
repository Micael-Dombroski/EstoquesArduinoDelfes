import { z } from 'zod';

export const perfilEnum = z.enum(['SOLICITANTE', 'ALMOXARIFADO', 'COMPRAS', 'SUPERVISOR']);
export type Perfil = z.infer<typeof perfilEnum>;

export const loginSchema = z
  .object({
    email: z.string().trim().email('Informe um e-mail válido'),
    senha: z.string().min(1, 'Informe a senha'),
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;


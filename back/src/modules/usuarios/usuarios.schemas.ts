import { z } from 'zod';
import { perfilEnum } from '../auth/auth.schemas';

export const listarUsuariosSchema = z.object({
  busca: z.string().trim().optional(),
  perfil: perfilEnum.optional(),
  ativo: z.enum(['true', 'false']).optional(),
});

export const criarUsuarioSchema = z
  .object({
    nome: z.string().trim().min(2, 'O nome deve ter pelo menos 2 caracteres').max(120),
    email: z.string().trim().email('Informe um e-mail válido').max(150),
    senha: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres').max(100),
    perfil: perfilEnum,
    requisitanteId: z.number().int().positive().nullish(),
    criarRequisitanteAutomatico: z.boolean().optional(),
    setorRequisitante: z.string().trim().max(80).nullish(),
    ativo: z.boolean().optional().default(true),
  })
  .strict();

export const atualizarUsuarioSchema = z
  .object({
    nome: z.string().trim().min(2, 'O nome deve ter pelo menos 2 caracteres').max(120).optional(),
    email: z.string().trim().email('Informe um e-mail válido').max(150).optional(),
    senha: z
      .string()
      .transform((v) => v.trim())
      .refine((v) => v === '' || v.length >= 6, 'A nova senha deve ter pelo menos 6 caracteres')
      .optional(),
    perfil: perfilEnum.optional(),
    requisitanteId: z.number().int().positive().nullish(),
    ativo: z.boolean().optional(),
  })
  .strict();

export type ListarUsuarios = z.infer<typeof listarUsuariosSchema>;
export type CriarUsuario = z.infer<typeof criarUsuarioSchema>;
export type AtualizarUsuario = z.infer<typeof atualizarUsuarioSchema>;

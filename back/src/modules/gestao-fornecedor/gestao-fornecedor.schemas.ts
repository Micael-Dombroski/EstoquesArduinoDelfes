import { z } from 'zod';
import { cnpjValido, formatarCnpj, somenteDigitos } from '../cadastro-fornecedor/cadastro-fornecedor.schemas';

const dinheiro = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim().replace(',', '.'))
  .refine((v) => /^\d{1,10}(\.\d{1,2})?$/.test(v), 'Valor inválido (use até 2 casas decimais).');

// Edita apenas vínculos que já existem (não adiciona nem remove produtos)
const vinculo = z
  .object({
    produtoId: z.number().int().positive(),
    prazoEntregaDias: z.number().int().min(0, 'Prazo inválido.').max(365, 'Prazo máximo de 365 dias.'),
    precoUnitario: dinheiro.optional(),
    preferencial: z.boolean(),
  })
  .strict();

// PUT: campos opcionais ausentes são LIMPOS (viram null)
export const atualizarFornecedorSchema = z
  .object({
    nome: z.string().trim().min(2, 'Informe o nome do fornecedor.').max(150),
    cnpj: z
      .string()
      .trim()
      .refine((v) => cnpjValido(somenteDigitos(v)), 'CNPJ inválido.')
      .transform((v) => formatarCnpj(somenteDigitos(v)))
      .optional(),
    contato: z.string().trim().max(100).optional(),
    email: z.string().trim().email('E-mail inválido.').max(150).optional(),
    telefone: z.string().trim().max(30).optional(),
    valorMinimoPedido: dinheiro.optional(),
    produtos: z.array(vinculo).max(200),
  })
  .strict()
  .superRefine((b, ctx) => {
    const ids = b.produtos.map((p) => p.produtoId);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', message: 'Há produtos repetidos na lista.', path: ['produtos'] });
    }
  });

export const alterarAtivoSchema = z.object({ ativo: z.boolean() }).strict();

export type AtualizarFornecedor = z.infer<typeof atualizarFornecedorSchema>;
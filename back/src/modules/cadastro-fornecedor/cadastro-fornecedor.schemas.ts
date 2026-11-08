import { z } from 'zod';

export const somenteDigitos = (s: string) => s.replace(/\D/g, '');
export const formatarCnpj = (d: string) => d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');

export function cnpjValido(digitos: string): boolean {
  if (digitos.length !== 14 || /^(\d)\1{13}$/.test(digitos)) return false;
  const dv = (base: string, pesos: number[]) => {
    const soma = base.split('').reduce((acc, d, i) => acc + Number(d) * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = dv(digitos.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv(digitos.slice(0, 12) + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return digitos.endsWith(`${d1}${d2}`);
}

// Dinheiro chega como string ("400.00") ou número; guarda com até 2 casas (colunas Decimal(12,2)).
const dinheiro = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim().replace(',', '.'))
  .refine((v) => /^\d{1,10}(\.\d{1,2})?$/.test(v), 'Valor inválido (use até 2 casas decimais).');

// Quantidades usam Decimal(12,3): até 3 casas.
const quantidade = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim().replace(',', '.'))
  .refine((v) => /^\d{1,9}(\.\d{1,3})?$/.test(v), 'Quantidade inválida (use até 3 casas decimais).');

// Dados do vínculo produto x fornecedor (iguais para produto existente ou novo)
const vinculo = {
  prazoEntregaDias: z.number().int().min(0, 'Prazo inválido.').max(365, 'Prazo máximo de 365 dias.'),
  precoUnitario: dinheiro.optional(),
  preferencial: z.boolean().default(false),
};

// Produto criado junto com o fornecedor. Sem saldoAtual de propósito:
// o saldo nasce 0 (default do banco) e só muda por movimentação.
const novoProduto = z
  .object({
    codigo: z.string().trim().min(1, 'Informe o código do produto.').max(40),
    nome: z.string().trim().min(2, 'Informe o nome do produto.').max(150),
    unidade: z.string().trim().min(1, 'Informe a unidade.').max(10),
    marca: z.string().trim().max(80).optional(),
    pontoReposicao: quantidade.optional(),
  })
  .strict();

// Cada linha é OU um produto já cadastrado (produtoId) OU um produto novo (novoProduto).
const linhaExistente = z.object({ produtoId: z.number().int().positive(), ...vinculo }).strict();
const linhaNova = z.object({ novoProduto, ...vinculo }).strict();
const linhaProduto = z.union([linhaExistente, linhaNova]);

export const criarFornecedorSchema = z
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
    produtos: z.array(linhaProduto).min(1, 'Inclua pelo menos um produto.').max(200),
  })
  .strict()
  .superRefine((b, ctx) => {
    const ids = b.produtos.flatMap((p) => ('produtoId' in p ? [p.produtoId] : []));
    const codigos = b.produtos.flatMap((p) => ('novoProduto' in p ? [p.novoProduto.codigo.toLowerCase()] : []));
    if (new Set(ids).size !== ids.length || new Set(codigos).size !== codigos.length) {
      ctx.addIssue({ code: 'custom', message: 'Há produtos repetidos na lista.', path: ['produtos'] });
    }
  });

export type CriarFornecedor = z.infer<typeof criarFornecedorSchema>;
import { z } from 'zod';
import { paginacaoSchema } from '../../shared/pagination';
import { ateQuery, deQuery } from '../../shared/schemas';
import { quantidadePositiva, valorNaoNegativo } from '../../shared/decimal';

const statusEnum = z.enum(['RASCUNHO', 'ENVIADO', 'RECEBIDO_PARCIAL', 'RECEBIDO', 'CANCELADO']);

const itemSchema = z
  .object({
    produtoId: z.number().int().positive(),
    quantidade: quantidadePositiva,
    marca: z.string().trim().max(80).nullish(),
    precoUnitario: valorNaoNegativo.nullish(),
  })
  .strict();

// @@unique([pedidoId, produtoId]) no banco: o mesmo produto não pode repetir no pedido
const itensSchema = z
  .array(itemSchema)
  .min(1, 'Informe ao menos um item')
  .refine((itens) => new Set(itens.map((i) => i.produtoId)).size === itens.length, 'Produto repetido na lista de itens');

export const criarEntradaSchema = z
  .object({
    fornecedorId: z.number().int().positive(),
    previsaoEntrega: z.coerce.date().nullish(),
    observacao: z.string().trim().nullish(),
    itens: itensSchema,
  })
  .strict();

export const atualizarEntradaSchema = z
  .object({
    fornecedorId: z.number().int().positive().optional(),
    previsaoEntrega: z.coerce.date().nullish(),
    observacao: z.string().trim().nullish(),
  })
  .strict();

export const substituirItensSchema = z.object({ itens: itensSchema }).strict();

export const receberSchema = z
  .object({
    itens: z
      .array(z.object({ itemId: z.number().int().positive(), quantidade: quantidadePositiva }).strict())
      .min(1, 'Informe ao menos um item')
      .refine((itens) => new Set(itens.map((i) => i.itemId)).size === itens.length, 'Item repetido'),
  })
  .strict();

export const listarEntradasSchema = paginacaoSchema.extend({
  status: statusEnum.optional(),
  fornecedorId: z.coerce.number().int().positive().optional(),
  de: deQuery.optional(),
  ate: ateQuery.optional(),
});

export type CriarEntrada = z.infer<typeof criarEntradaSchema>;
export type AtualizarEntrada = z.infer<typeof atualizarEntradaSchema>;
export type SubstituirItens = z.infer<typeof substituirItensSchema>;
export type ReceberBody = z.infer<typeof receberSchema>;
export type ListarEntradas = z.infer<typeof listarEntradasSchema>;

import { z } from 'zod';
import { paginacaoSchema } from '../../shared/pagination';
import { boolQuery } from '../../shared/schemas';
import { quantidadeNaoNegativa, valorNaoNegativo } from '../../shared/decimal';

const campos = {
  codigo: z.string().trim().min(1).max(40),
  nome: z.string().trim().min(1).max(150),
  descricao: z.string().trim().nullish(),
  unidade: z.string().trim().min(1).max(10),
  marca: z.string().trim().max(80).nullish(),
  pontoReposicao: quantidadeNaoNegativa.optional(),
  diasSeguranca: z.number().int().min(0).optional(),
};

// .strict() rejeita campos desconhecidos — em especial saldoAtual, que só a trigger pode alterar.
export const criarProdutoSchema = z.object(campos).strict();
export const atualizarProdutoSchema = z
  .object(campos)
  .partial()
  .extend({ ativo: z.boolean().optional() })
  .strict();

export const listarProdutosSchema = paginacaoSchema.extend({
  q: z.string().trim().optional(),
  ativo: boolQuery.optional(),
});

export const buscaSchema = z.object({
  q: z.string().trim().min(1),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

export const codigoParamSchema = z.object({ codigo: z.string().trim().min(1) });

export const vinculoParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  fornecedorId: z.coerce.number().int().positive(),
});

export const vinculoBodySchema = z
  .object({
    prazoEntregaDias: z.number().int().min(0),
    precoUnitario: valorNaoNegativo.nullish(),
    preferencial: z.boolean().default(false),
  })
  .strict();

export type CriarProduto = z.infer<typeof criarProdutoSchema>;
export type AtualizarProduto = z.infer<typeof atualizarProdutoSchema>;
export type ListarProdutos = z.infer<typeof listarProdutosSchema>;
export type BuscaQuery = z.infer<typeof buscaSchema>;
export type CodigoParam = z.infer<typeof codigoParamSchema>;
export type VinculoParam = z.infer<typeof vinculoParamSchema>;
export type VinculoBody = z.infer<typeof vinculoBodySchema>;

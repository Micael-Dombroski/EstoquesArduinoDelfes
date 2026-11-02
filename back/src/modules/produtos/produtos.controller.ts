import type { RequestHandler } from 'express';
import { valid } from '../../middlewares/validate';
import type { IdParam } from '../../shared/schemas';
import * as service from './produtos.service';
import type {
  AtualizarProduto,
  BuscaQuery,
  CodigoParam,
  CriarProduto,
  ListarProdutos,
  VinculoBody,
  VinculoParam,
} from './produtos.schemas';

export const listar: RequestHandler = async (_req, res) => {
  const { query } = valid<{ query: ListarProdutos }>(res);
  res.json(await service.listar(query));
};

export const buscar: RequestHandler = async (_req, res) => {
  const { query } = valid<{ query: BuscaQuery }>(res);
  res.json(await service.buscar(query.q, query.limit));
};

export const porCodigo: RequestHandler = async (_req, res) => {
  const { params } = valid<{ params: CodigoParam }>(res);
  res.json(await service.porCodigo(params.codigo));
};

export const obter: RequestHandler = async (_req, res) => {
  const { params } = valid<{ params: IdParam }>(res);
  res.json(await service.obter(params.id));
};

export const criar: RequestHandler = async (_req, res) => {
  const { body } = valid<{ body: CriarProduto }>(res);
  res.status(201).json(await service.criar(body));
};

export const atualizar: RequestHandler = async (_req, res) => {
  const { params, body } = valid<{ params: IdParam; body: AtualizarProduto }>(res);
  res.json(await service.atualizar(params.id, body));
};

export const desativar: RequestHandler = async (_req, res) => {
  const { params } = valid<{ params: IdParam }>(res);
  await service.desativar(params.id);
  res.status(204).send();
};

export const salvarVinculo: RequestHandler = async (_req, res) => {
  const { params, body } = valid<{ params: VinculoParam; body: VinculoBody }>(res);
  res.json(await service.salvarVinculo(params.id, params.fornecedorId, body));
};

export const removerVinculo: RequestHandler = async (_req, res) => {
  const { params } = valid<{ params: VinculoParam }>(res);
  await service.removerVinculo(params.id, params.fornecedorId);
  res.status(204).send();
};

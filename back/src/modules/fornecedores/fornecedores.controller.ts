import type { RequestHandler } from 'express';
import { valid } from '../../middlewares/validate';
import type { IdParam } from '../../shared/schemas';
import * as service from './fornecedores.service';
import type { AtualizarFornecedor, CriarFornecedor, ListarFornecedores } from './fornecedores.schemas';

export const listar: RequestHandler = async (_req, res) => {
  const { query } = valid<{ query: ListarFornecedores }>(res);
  res.json(await service.listar(query));
};

export const obter: RequestHandler = async (_req, res) => {
  const { params } = valid<{ params: IdParam }>(res);
  res.json(await service.obter(params.id));
};

export const criar: RequestHandler = async (_req, res) => {
  const { body } = valid<{ body: CriarFornecedor }>(res);
  res.status(201).json(await service.criar(body));
};

export const atualizar: RequestHandler = async (_req, res) => {
  const { params, body } = valid<{ params: IdParam; body: AtualizarFornecedor }>(res);
  res.json(await service.atualizar(params.id, body));
};

export const desativar: RequestHandler = async (_req, res) => {
  const { params } = valid<{ params: IdParam }>(res);
  await service.desativar(params.id);
  res.status(204).send();
};

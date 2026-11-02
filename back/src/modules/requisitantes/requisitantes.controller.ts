import type { RequestHandler } from 'express';
import { valid } from '../../middlewares/validate';
import type { IdParam } from '../../shared/schemas';
import * as service from './requisitantes.service';
import type { AtualizarRequisitante, CriarRequisitante, ListarRequisitantes } from './requisitantes.schemas';

export const listar: RequestHandler = async (_req, res) => {
  const { query } = valid<{ query: ListarRequisitantes }>(res);
  res.json(await service.listar(query));
};

export const obter: RequestHandler = async (_req, res) => {
  const { params } = valid<{ params: IdParam }>(res);
  res.json(await service.obter(params.id));
};

export const criar: RequestHandler = async (_req, res) => {
  const { body } = valid<{ body: CriarRequisitante }>(res);
  res.status(201).json(await service.criar(body));
};

export const atualizar: RequestHandler = async (_req, res) => {
  const { params, body } = valid<{ params: IdParam; body: AtualizarRequisitante }>(res);
  res.json(await service.atualizar(params.id, body));
};

export const desativar: RequestHandler = async (_req, res) => {
  const { params } = valid<{ params: IdParam }>(res);
  await service.desativar(params.id);
  res.status(204).send();
};

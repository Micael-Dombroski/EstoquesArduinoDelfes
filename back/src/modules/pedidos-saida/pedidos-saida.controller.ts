import type { RequestHandler } from 'express';
import { valid } from '../../middlewares/validate';
import type { IdParam } from '../../shared/schemas';
import * as service from './pedidos-saida.service';
import type { CriarSaida, ListarSaidas } from './pedidos-saida.schemas';

export const listar: RequestHandler = async (_req, res) => {
  const { query } = valid<{ query: ListarSaidas }>(res);
  res.json(await service.listar(query));
};

export const obter: RequestHandler = async (_req, res) => {
  const { params } = valid<{ params: IdParam }>(res);
  res.json(await service.obter(params.id));
};

export const criar: RequestHandler = async (_req, res) => {
  const { body } = valid<{ body: CriarSaida }>(res);
  res.status(201).json(await service.criar(body));
};

export const cancelar: RequestHandler = async (_req, res) => {
  const { params } = valid<{ params: IdParam }>(res);
  res.json(await service.cancelar(params.id));
};

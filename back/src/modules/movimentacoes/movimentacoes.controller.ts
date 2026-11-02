import type { RequestHandler } from 'express';
import { valid } from '../../middlewares/validate';
import type { IdParam } from '../../shared/schemas';
import * as service from './movimentacoes.service';
import type { AjusteBody, EstornoBody, ListarMovimentacoes } from './movimentacoes.schemas';

export const listar: RequestHandler = async (_req, res) => {
  const { query } = valid<{ query: ListarMovimentacoes }>(res);
  res.json(await service.listar(query));
};

export const obter: RequestHandler = async (_req, res) => {
  const { params } = valid<{ params: IdParam }>(res);
  res.json(await service.obter(params.id));
};

export const ajustar: RequestHandler = async (_req, res) => {
  const { body } = valid<{ body: AjusteBody }>(res);
  res.status(201).json(await service.ajustar(body));
};

export const estornar: RequestHandler = async (_req, res) => {
  const { params, body } = valid<{ params: IdParam; body: EstornoBody }>(res);
  res.status(201).json(await service.estornar(params.id, body?.observacao));
};

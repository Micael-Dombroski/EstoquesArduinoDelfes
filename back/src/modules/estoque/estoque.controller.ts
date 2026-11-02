import type { RequestHandler } from 'express';
import { valid } from '../../middlewares/validate';
import * as service from './estoque.service';
import type { Parados, Situacao } from './estoque.schemas';

export const situacao: RequestHandler = async (_req, res) => {
  const { query } = valid<{ query: Situacao }>(res);
  res.json(await service.situacao(query));
};

export const parados: RequestHandler = async (_req, res) => {
  const { query } = valid<{ query: Parados }>(res);
  res.json(await service.parados(query));
};

export const resumo: RequestHandler = async (_req, res) => {
  res.json(await service.resumo());
};

import type { RequestHandler } from 'express';
import { valid } from '../../middlewares/validate';
import * as service from './reposicao.service';
import type { RascunhoBody, SugestoesQuery } from './reposicao.schemas';

export const sugestoes: RequestHandler = async (_req, res) => {
  const { query } = valid<{ query: SugestoesQuery }>(res);
  res.json(await service.sugestoes(query));
};

export const gerarRascunho: RequestHandler = async (_req, res) => {
  const { body } = valid<{ body: RascunhoBody }>(res);
  res.status(201).json(await service.gerarRascunho(body));
};
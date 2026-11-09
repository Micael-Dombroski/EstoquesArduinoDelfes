import type { RequestHandler } from 'express';
import { usuarioAtual } from '../../middlewares/auth';
import { valid } from '../../middlewares/validate';
import type { IdParam } from '../../shared/schemas';
import type { AtualizarUsuario, CriarUsuario, ListarUsuarios } from './usuarios.schemas';
import * as service from './usuarios.service';

export const listar: RequestHandler = async (_req, res) => {
  const { query } = valid<{ query: ListarUsuarios }>(res);
  res.json(await service.listar(query));
};

export const obter: RequestHandler = async (_req, res) => {
  const { params } = valid<{ params: IdParam }>(res);
  res.json(await service.obter(params.id));
};

export const criar: RequestHandler = async (_req, res) => {
  const { body } = valid<{ body: CriarUsuario }>(res);
  res.status(201).json(await service.criar(body));
};

export const atualizar: RequestHandler = async (_req, res) => {
  const { params, body } = valid<{ params: IdParam; body: AtualizarUsuario }>(res);
  const logado = usuarioAtual(res);
  res.json(await service.atualizar(params.id, body, logado?.id));
};

export const remover: RequestHandler = async (_req, res) => {
  const { params } = valid<{ params: IdParam }>(res);
  const logado = usuarioAtual(res);
  await service.remover(params.id, logado?.id);
  res.status(204).send();
};

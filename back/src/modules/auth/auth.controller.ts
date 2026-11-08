import type { RequestHandler } from 'express';
import { valid } from '../../middlewares/validate';
import { usuarioAtual } from '../../middlewares/auth';
import type { LoginInput } from './auth.schemas';
import * as service from './auth.service';

export const login: RequestHandler = async (_req, res) => {
  const { body } = valid<{ body: LoginInput }>(res);
  res.json(await service.login(body));
};

export const me: RequestHandler = (_req, res) => {
  res.json({ data: usuarioAtual(res) });
};

export const usuariosDemo: RequestHandler = async (_req, res) => {
  res.json(await service.listarUsuariosDemo());
};


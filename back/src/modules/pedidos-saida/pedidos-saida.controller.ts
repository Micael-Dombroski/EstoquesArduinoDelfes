import type { RequestHandler } from 'express';
import { valid } from '../../middlewares/validate';
import type { IdParam } from '../../shared/schemas';
import { verificarToken } from '../auth/auth.service';
import * as service from './pedidos-saida.service';
import type { BaixarSaida, CriarSaida, ListarSaidas, SepararSaida } from './pedidos-saida.schemas';

export const listar: RequestHandler = async (_req, res) => {
  const { query } = valid<{ query: ListarSaidas }>(res);
  res.json(await service.listar(query));
};

export const obter: RequestHandler = async (_req, res) => {
  const { params } = valid<{ params: IdParam }>(res);
  res.json(await service.obter(params.id));
};

export const criar: RequestHandler = async (req, res) => {
  const { body } = valid<{ body: CriarSaida }>(res);
  let forcarPendente = false;
  const auth = req.headers.authorization;
  if (auth?.toLowerCase().startsWith('bearer ')) {
    try {
      const usuario = verificarToken(auth.slice(7).trim());
      if (usuario.perfil === 'SOLICITANTE') {
        forcarPendente = true;
      }
    } catch {
      // ignora token inválido se a rota for chamada sem autenticação obrigatória
    }
  }
  res.status(201).json(await service.criar(body, forcarPendente));
};

export const atualizarSeparacao: RequestHandler = async (_req, res) => {
  const { params, body } = valid<{ params: IdParam; body: SepararSaida }>(res);
  res.json(await service.atualizarSeparacao(params.id, body));
};

export const baixar: RequestHandler = async (_req, res) => {
  const { params, body } = valid<{ params: IdParam; body: BaixarSaida }>(res);
  res.json(await service.baixar(params.id, body));
};

export const cancelar: RequestHandler = async (_req, res) => {
  const { params } = valid<{ params: IdParam }>(res);
  res.json(await service.cancelar(params.id));
};

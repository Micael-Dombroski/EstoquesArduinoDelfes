import type { RequestHandler } from 'express';
import { valid } from '../../middlewares/validate';
import type { IdParam } from '../../shared/schemas';
import type { UsuarioSessao } from '../auth/auth.service';
import * as service from './pedidos-entrada.service';
import type {
  AtualizarEntrada,
  CriarEntrada,
  EnviarEntradaBody,
  LancarNfBody,
  ListarEntradas,
  ListarRecebimentos,
  ReceberBody,
  SubstituirItens,
} from './pedidos-entrada.schemas';

export const listar: RequestHandler = async (_req, res) => {
  const { query } = valid<{ query: ListarEntradas }>(res);
  res.json(await service.listar(query));
};

export const listarRecebimentos: RequestHandler = async (_req, res) => {
  const { query } = valid<{ query: ListarRecebimentos }>(res);
  res.json(await service.listarRecebimentos(query));
};

export const obter: RequestHandler = async (_req, res) => {
  const { params } = valid<{ params: IdParam }>(res);
  res.json(await service.obter(params.id));
};

export const criar: RequestHandler = async (_req, res) => {
  const { body } = valid<{ body: CriarEntrada }>(res);
  res.status(201).json(await service.criar(body));
};

export const atualizarCabecalho: RequestHandler = async (_req, res) => {
  const { params, body } = valid<{ params: IdParam; body: AtualizarEntrada }>(res);
  res.json(await service.atualizarCabecalho(params.id, body));
};

export const substituirItens: RequestHandler = async (_req, res) => {
  const { params, body } = valid<{ params: IdParam; body: SubstituirItens }>(res);
  res.json(await service.substituirItens(params.id, body));
};

export const excluir: RequestHandler = async (_req, res) => {
  const { params } = valid<{ params: IdParam }>(res);
  await service.excluir(params.id);
  res.status(204).send();
};

export const enviar: RequestHandler = async (_req, res) => {
  const { params, body } = valid<{ params: IdParam; body?: EnviarEntradaBody }>(res);
  res.json(await service.enviar(params.id, body));
};

export const receber: RequestHandler = async (_req, res) => {
  const { params, body } = valid<{ params: IdParam; body: ReceberBody }>(res);
  const usuario = res.locals.usuario as UsuarioSessao | undefined;
  res.status(201).json(await service.receber(params.id, body, usuario?.nome));
};

export const lancarNfRecebimento: RequestHandler = async (_req, res) => {
  const { params, body } = valid<{ params: IdParam; body: LancarNfBody }>(res);
  const usuario = res.locals.usuario as UsuarioSessao | undefined;
  res.json(await service.lancarNfRecebimento(params.id, body, usuario?.nome));
};

export const cancelar: RequestHandler = async (_req, res) => {
  const { params } = valid<{ params: IdParam }>(res);
  res.json(await service.cancelar(params.id));
};

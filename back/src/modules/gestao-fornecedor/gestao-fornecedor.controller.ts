import type { NextFunction, Request, Response } from 'express';
import { ErroCadastro } from '../cadastro-fornecedor/cadastro-fornecedor.service';
import { alterarAtivo, atualizarFornecedor, listarFornecedores } from './gestao-fornecedor.service';
import type { AtualizarFornecedor } from './gestao-fornecedor.schemas';

function responderErro(e: unknown, res: Response, next: NextFunction) {
  if (e instanceof ErroCadastro) {
    return res.status(e.status).json({ error: { code: e.code, message: e.message, details: e.details } });
  }
  next(e);
}

function idDaRota(req: Request) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new ErroCadastro(400, 'VALIDATION_ERROR', 'Identificador inválido.');
  return id;
}

export async function listar(req: Request, res: Response, next: NextFunction) {
  try {
    const ativo = req.query.ativo !== 'false'; // padrão: ativos
    res.json({ data: await listarFornecedores(ativo) });
  } catch (e) {
    responderErro(e, res, next);
  }
}

export async function atualizar(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ data: await atualizarFornecedor(idDaRota(req), req.body as AtualizarFornecedor) });
  } catch (e) {
    responderErro(e, res, next);
  }
}

export async function mudarAtivo(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ data: await alterarAtivo(idDaRota(req), (req.body as { ativo: boolean }).ativo) });
  } catch (e) {
    responderErro(e, res, next);
  }
}
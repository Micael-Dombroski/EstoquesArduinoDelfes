import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../shared/AppError';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dados inválidos',
        details: err.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message })),
      },
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }

  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'JSON_INVALIDO', message: 'Corpo da requisição não é um JSON válido' } });
    return;
  }

  // CHECK (saldo_atual >= 0) disparado pela trigger de movimentação
  if (String(err?.message ?? '').includes('ck_produtos_saldo_nao_negativo')) {
    res.status(422).json({ error: { code: 'SALDO_INSUFICIENTE', message: 'Saldo insuficiente para a operação' } });
    return;
  }

  switch (err?.code) {
    case 'P2002':
      res.status(409).json({ error: { code: 'CONFLITO', message: 'Já existe um registro com esse valor único', details: err.meta?.target } });
      return;
    case 'P2003':
      res.status(409).json({ error: { code: 'REFERENCIA_INVALIDA', message: 'Registro inexistente ou referenciado por outros registros' } });
      return;
    case 'P2025':
      res.status(404).json({ error: { code: 'NAO_ENCONTRADO', message: 'Registro não encontrado' } });
      return;
  }

  console.error(err);
  res.status(500).json({ error: { code: 'ERRO_INTERNO', message: 'Erro interno do servidor' } });
};

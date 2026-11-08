import type { NextFunction, Request, Response } from 'express';
import { ErroCadastro, cadastrarFornecedor } from './cadastro-fornecedor.service';
import type { CriarFornecedor } from './cadastro-fornecedor.schemas';

export async function criar(req: Request, res: Response, next: NextFunction) {
  try {
    const fornecedor = await cadastrarFornecedor(req.body as CriarFornecedor);
    res.status(201).json({ data: fornecedor });
  } catch (e) {
    if (e instanceof ErroCadastro) {
      // Mesmo formato de erro do restante da API
      return res.status(e.status).json({ error: { code: e.code, message: e.message, details: e.details } });
    }
    next(e);
  }
}

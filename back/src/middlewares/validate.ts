import type { RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';

type Esquemas = { body?: ZodType; query?: ZodType; params?: ZodType };

/**
 * Valida params/query/body com zod. O resultado já convertido fica em res.locals.valid
 * (no Express 5 req.query é somente leitura, então não dá para sobrescrevê-lo).
 * Erros de validação caem no errorHandler (400).
 */
export const validate =
  (esquemas: Esquemas): RequestHandler =>
  (req, res, next) => {
    res.locals.valid = {
      ...(esquemas.params ? { params: esquemas.params.parse(req.params) } : {}),
      ...(esquemas.query ? { query: esquemas.query.parse(req.query) } : {}),
      ...(esquemas.body ? { body: esquemas.body.parse(req.body) } : {}),
    };
    next();
  };

/** Lê o que o validate() gravou. Ex.: const { body } = valid<{ body: CriarProduto }>(res) */
export const valid = <T>(res: Response): T => res.locals.valid as T;

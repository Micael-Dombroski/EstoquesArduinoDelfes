import { Router } from 'express';
import { validate } from '../../middlewares/validate';
import { idParamSchema } from '../../shared/schemas';
import * as controller from './movimentacoes.controller';
import { ajusteSchema, estornoBodySchema, listarMovimentacoesSchema } from './movimentacoes.schemas';

// Não existe POST/PUT/DELETE genérico: o livro-razão é imutável (trigger no banco).
// Movimentações nascem de saída, recebimento, ajuste e estorno.
export const movimentacoesRouter = Router();

movimentacoesRouter.get('/', validate({ query: listarMovimentacoesSchema }), controller.listar);
movimentacoesRouter.post('/ajustes', validate({ body: ajusteSchema }), controller.ajustar);
movimentacoesRouter.get('/:id', validate({ params: idParamSchema }), controller.obter);
movimentacoesRouter.post('/:id/estorno', validate({ params: idParamSchema, body: estornoBodySchema }), controller.estornar);

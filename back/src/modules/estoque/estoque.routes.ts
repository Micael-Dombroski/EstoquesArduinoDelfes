import { Router } from 'express';
import { validate } from '../../middlewares/validate';
import * as controller from './estoque.controller';
import { paradosSchema, situacaoSchema } from './estoque.schemas';

// Somente leitura: tudo vem das views do extras.sql.
export const estoqueRouter = Router();

estoqueRouter.get('/situacao', validate({ query: situacaoSchema }), controller.situacao);
estoqueRouter.get('/parados', validate({ query: paradosSchema }), controller.parados);
estoqueRouter.get('/resumo', controller.resumo);

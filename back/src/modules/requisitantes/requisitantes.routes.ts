import { Router } from 'express';
import { validate } from '../../middlewares/validate';
import { idParamSchema } from '../../shared/schemas';
import * as controller from './requisitantes.controller';
import {
  atualizarRequisitanteSchema,
  criarRequisitanteSchema,
  listarRequisitantesSchema,
} from './requisitantes.schemas';

export const requisitantesRouter = Router();

requisitantesRouter.get('/', validate({ query: listarRequisitantesSchema }), controller.listar);
requisitantesRouter.get('/:id', validate({ params: idParamSchema }), controller.obter);
requisitantesRouter.post('/', validate({ body: criarRequisitanteSchema }), controller.criar);
requisitantesRouter.patch('/:id', validate({ params: idParamSchema, body: atualizarRequisitanteSchema }), controller.atualizar);
requisitantesRouter.delete('/:id', validate({ params: idParamSchema }), controller.desativar);

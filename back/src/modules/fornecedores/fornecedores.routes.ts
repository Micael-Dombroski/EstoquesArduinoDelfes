import { Router } from 'express';
import { validate } from '../../middlewares/validate';
import { idParamSchema } from '../../shared/schemas';
import * as controller from './fornecedores.controller';
import {
  atualizarFornecedorSchema,
  criarFornecedorSchema,
  listarFornecedoresSchema,
} from './fornecedores.schemas';

export const fornecedoresRouter = Router();

fornecedoresRouter.get('/', validate({ query: listarFornecedoresSchema }), controller.listar);
fornecedoresRouter.get('/:id', validate({ params: idParamSchema }), controller.obter);
fornecedoresRouter.post('/', validate({ body: criarFornecedorSchema }), controller.criar);
fornecedoresRouter.patch('/:id', validate({ params: idParamSchema, body: atualizarFornecedorSchema }), controller.atualizar);
fornecedoresRouter.delete('/:id', validate({ params: idParamSchema }), controller.desativar);

import { Router } from 'express';
import { validate } from '../../middlewares/validate';
import { idParamSchema } from '../../shared/schemas';
import * as controller from './produtos.controller';
import {
  atualizarProdutoSchema,
  buscaSchema,
  codigoParamSchema,
  criarProdutoSchema,
  listarProdutosSchema,
  vinculoBodySchema,
  vinculoParamSchema,
} from './produtos.schemas';

export const produtosRouter = Router();

produtosRouter.get('/', validate({ query: listarProdutosSchema }), controller.listar);

// rotas fixas ANTES de '/:id', senão "busca" seria interpretado como um id
produtosRouter.get('/busca', validate({ query: buscaSchema }), controller.buscar);
produtosRouter.get('/por-codigo/:codigo', validate({ params: codigoParamSchema }), controller.porCodigo);

produtosRouter.get('/:id', validate({ params: idParamSchema }), controller.obter);
produtosRouter.post('/', validate({ body: criarProdutoSchema }), controller.criar);
produtosRouter.patch('/:id', validate({ params: idParamSchema, body: atualizarProdutoSchema }), controller.atualizar);
produtosRouter.delete('/:id', validate({ params: idParamSchema }), controller.desativar);

produtosRouter.put(
  '/:id/fornecedores/:fornecedorId',
  validate({ params: vinculoParamSchema, body: vinculoBodySchema }),
  controller.salvarVinculo,
);
produtosRouter.delete(
  '/:id/fornecedores/:fornecedorId',
  validate({ params: vinculoParamSchema }),
  controller.removerVinculo,
);

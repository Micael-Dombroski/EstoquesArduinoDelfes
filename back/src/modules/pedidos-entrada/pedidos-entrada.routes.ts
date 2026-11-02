import { Router } from 'express';
import { validate } from '../../middlewares/validate';
import { idParamSchema } from '../../shared/schemas';
import * as controller from './pedidos-entrada.controller';
import {
  atualizarEntradaSchema,
  criarEntradaSchema,
  listarEntradasSchema,
  receberSchema,
  substituirItensSchema,
} from './pedidos-entrada.schemas';

export const pedidosEntradaRouter = Router();

pedidosEntradaRouter.get('/', validate({ query: listarEntradasSchema }), controller.listar);
pedidosEntradaRouter.post('/', validate({ body: criarEntradaSchema }), controller.criar);
pedidosEntradaRouter.get('/:id', validate({ params: idParamSchema }), controller.obter);
pedidosEntradaRouter.patch('/:id', validate({ params: idParamSchema, body: atualizarEntradaSchema }), controller.atualizarCabecalho);
pedidosEntradaRouter.put('/:id/itens', validate({ params: idParamSchema, body: substituirItensSchema }), controller.substituirItens);
pedidosEntradaRouter.delete('/:id', validate({ params: idParamSchema }), controller.excluir);

// transições de status (ações de negócio, não "PATCH status")
pedidosEntradaRouter.post('/:id/enviar', validate({ params: idParamSchema }), controller.enviar);
pedidosEntradaRouter.post('/:id/receber', validate({ params: idParamSchema, body: receberSchema }), controller.receber);
pedidosEntradaRouter.post('/:id/cancelar', validate({ params: idParamSchema }), controller.cancelar);

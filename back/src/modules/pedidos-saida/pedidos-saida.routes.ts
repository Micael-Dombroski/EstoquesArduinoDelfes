import { Router } from 'express';
import { exigirPerfil } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { idParamSchema } from '../../shared/schemas';
import * as controller from './pedidos-saida.controller';
import { criarSaidaSchema, listarSaidasSchema } from './pedidos-saida.schemas';

// Pedido de saída é imutável: sem PATCH/DELETE. A correção é cancelar (estorna os itens).
export const pedidosSaidaRouter = Router();

pedidosSaidaRouter.get('/', validate({ query: listarSaidasSchema }), controller.listar);
pedidosSaidaRouter.get('/:id', validate({ params: idParamSchema }), controller.obter);
pedidosSaidaRouter.post('/', validate({ body: criarSaidaSchema }), controller.criar);
pedidosSaidaRouter.post(
  '/:id/cancelar',
  exigirPerfil('ALMOXARIFADO', 'SUPERVISOR'),
  validate({ params: idParamSchema }),
  controller.cancelar,
);

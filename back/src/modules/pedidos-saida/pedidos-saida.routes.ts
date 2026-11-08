import { Router } from 'express';
import { exigirPerfil } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { idParamSchema } from '../../shared/schemas';
import * as controller from './pedidos-saida.controller';
import { baixarSaidaSchema, criarSaidaSchema, listarSaidasSchema, separarSaidaSchema } from './pedidos-saida.schemas';

// Pedido de saída: SOLICITANTE envia como PENDENTE; ALMOXARIFADO e SUPERVISOR conferem a separação, dão baixa ou cancelam/estornam.
export const pedidosSaidaRouter = Router();

pedidosSaidaRouter.get('/', validate({ query: listarSaidasSchema }), controller.listar);
pedidosSaidaRouter.get('/:id', validate({ params: idParamSchema }), controller.obter);
pedidosSaidaRouter.post('/', validate({ body: criarSaidaSchema }), controller.criar);
pedidosSaidaRouter.patch(
  '/:id/separacao',
  exigirPerfil('ALMOXARIFADO', 'SUPERVISOR'),
  validate({ params: idParamSchema, body: separarSaidaSchema }),
  controller.atualizarSeparacao,
);
pedidosSaidaRouter.post(
  '/:id/baixar',
  exigirPerfil('ALMOXARIFADO', 'SUPERVISOR'),
  validate({ params: idParamSchema, body: baixarSaidaSchema }),
  controller.baixar,
);
pedidosSaidaRouter.post(
  '/:id/cancelar',
  exigirPerfil('ALMOXARIFADO', 'SUPERVISOR'),
  validate({ params: idParamSchema }),
  controller.cancelar,
);

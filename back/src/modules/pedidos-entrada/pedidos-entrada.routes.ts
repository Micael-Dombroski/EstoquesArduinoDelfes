import { Router } from 'express';
import { exigirPerfil } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { idParamSchema } from '../../shared/schemas';
import * as controller from './pedidos-entrada.controller';
import {
  atualizarEntradaSchema,
  criarEntradaSchema,
  enviarEntradaSchema,
  lancarNfSchema,
  listarEntradasSchema,
  listarRecebimentosSchema,
  receberSchema,
  substituirItensSchema,
} from './pedidos-entrada.schemas';

export const pedidosEntradaRouter = Router();

pedidosEntradaRouter.get('/', validate({ query: listarEntradasSchema }), controller.listar);
pedidosEntradaRouter.get('/recebimentos', validate({ query: listarRecebimentosSchema }), controller.listarRecebimentos);
pedidosEntradaRouter.post(
  '/recebimentos/:id/nf',
  exigirPerfil('COMPRAS', 'SUPERVISOR'),
  validate({ params: idParamSchema, body: lancarNfSchema }),
  controller.lancarNfRecebimento,
);

pedidosEntradaRouter.post(
  '/',
  exigirPerfil('ALMOXARIFADO', 'COMPRAS', 'SUPERVISOR'),
  validate({ body: criarEntradaSchema }),
  controller.criar,
);
pedidosEntradaRouter.get('/:id', validate({ params: idParamSchema }), controller.obter);
pedidosEntradaRouter.patch(
  '/:id',
  exigirPerfil('ALMOXARIFADO', 'COMPRAS', 'SUPERVISOR'),
  validate({ params: idParamSchema, body: atualizarEntradaSchema }),
  controller.atualizarCabecalho,
);
pedidosEntradaRouter.put(
  '/:id/itens',
  exigirPerfil('ALMOXARIFADO', 'COMPRAS', 'SUPERVISOR'),
  validate({ params: idParamSchema, body: substituirItensSchema }),
  controller.substituirItens,
);
pedidosEntradaRouter.delete(
  '/:id',
  exigirPerfil('ALMOXARIFADO', 'COMPRAS', 'SUPERVISOR'),
  validate({ params: idParamSchema }),
  controller.excluir,
);

// transições de status (ações de negócio, não "PATCH status")
pedidosEntradaRouter.post(
  '/:id/enviar',
  exigirPerfil('COMPRAS', 'SUPERVISOR'),
  validate({ params: idParamSchema, body: enviarEntradaSchema }),
  controller.enviar,
);
pedidosEntradaRouter.post(
  '/:id/receber',
  exigirPerfil('ALMOXARIFADO', 'SUPERVISOR'),
  validate({ params: idParamSchema, body: receberSchema }),
  controller.receber,
);
pedidosEntradaRouter.post(
  '/:id/cancelar',
  exigirPerfil('COMPRAS', 'SUPERVISOR'),
  validate({ params: idParamSchema }),
  controller.cancelar,
);

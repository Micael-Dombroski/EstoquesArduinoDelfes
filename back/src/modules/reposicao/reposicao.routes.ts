import { Router } from 'express';
import { exigirPerfil } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import * as controller from './reposicao.controller';
import { rascunhoSchema, sugestoesQuerySchema } from './reposicao.schemas';

export const reposicaoRouter = Router();

reposicaoRouter.get('/sugestoes', validate({ query: sugestoesQuerySchema }), controller.sugestoes);
reposicaoRouter.post(
  '/rascunhos',
  exigirPerfil('ALMOXARIFADO', 'COMPRAS', 'SUPERVISOR'),
  validate({ body: rascunhoSchema }),
  controller.gerarRascunho,
);

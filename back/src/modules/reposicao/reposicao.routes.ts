import { Router } from 'express';
import { validate } from '../../middlewares/validate';
import * as controller from './reposicao.controller';
import { rascunhoSchema, sugestoesQuerySchema } from './reposicao.schemas';

export const reposicaoRouter = Router();

reposicaoRouter.get('/sugestoes', validate({ query: sugestoesQuerySchema }), controller.sugestoes);
reposicaoRouter.post('/rascunhos', validate({ body: rascunhoSchema }), controller.gerarRascunho);

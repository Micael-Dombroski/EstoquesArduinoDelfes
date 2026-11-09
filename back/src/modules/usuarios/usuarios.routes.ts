import { Router } from 'express';
import { exigirPerfil } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { idParamSchema } from '../../shared/schemas';
import * as controller from './usuarios.controller';
import { atualizarUsuarioSchema, criarUsuarioSchema, listarUsuariosSchema } from './usuarios.schemas';

export const usuariosRouter = Router();

// Todas as rotas de gestão de usuários são exclusivas para SUPERVISOR
usuariosRouter.use(exigirPerfil('SUPERVISOR'));

usuariosRouter.get('/', validate({ query: listarUsuariosSchema }), controller.listar);
usuariosRouter.get('/:id', validate({ params: idParamSchema }), controller.obter);
usuariosRouter.post('/', validate({ body: criarUsuarioSchema }), controller.criar);
usuariosRouter.patch('/:id', validate({ params: idParamSchema, body: atualizarUsuarioSchema }), controller.atualizar);
usuariosRouter.delete('/:id', validate({ params: idParamSchema }), controller.remover);

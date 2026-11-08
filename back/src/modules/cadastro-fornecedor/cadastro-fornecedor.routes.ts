import { Router } from 'express';
import { validate } from '../../middlewares/validate';
// AJUSTE: use o mesmo guard de perfil das rotas que só COMPRAS/SUPERVISOR acessam
// (veja, por exemplo, a rota de aprovar em pedidos-entrada.routes.ts) e o nome real do export.
import { exigirPerfil } from '../../middlewares/auth';
import * as controller from './cadastro-fornecedor.controller';
import { criarFornecedorSchema } from './cadastro-fornecedor.schemas';

// Montar em /api/v1/cadastro-fornecedor  ->  POST /api/v1/cadastro-fornecedor
// Somente o perfil SUPERVISOR cadastra fornecedores.
export const cadastroFornecedorRouter = Router();

cadastroFornecedorRouter.post('/', exigirPerfil('SUPERVISOR'), validate({ body: criarFornecedorSchema }), controller.criar);

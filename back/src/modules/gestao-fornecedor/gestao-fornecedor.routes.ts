import { Router } from 'express';
import { validate } from '../../middlewares/validate';
import { exigirPerfil } from '../../middlewares/auth'; // mesmo nome ajustado no cadastro-fornecedor.routes.ts
import * as controller from './gestao-fornecedor.controller';
import { alterarAtivoSchema, atualizarFornecedorSchema } from '../gestao-fornecedor/gestao-fornecedor.schemas';

// Montar em /api/v1/gestao-fornecedores
// Consultar: ALMOXARIFADO, COMPRAS e SUPERVISOR (SOLICITANTE não vê).
// Alterar: somente SUPERVISOR.
export const gestaoFornecedorRouter = Router();

gestaoFornecedorRouter.get('/', exigirPerfil('ALMOXARIFADO', 'COMPRAS', 'SUPERVISOR'), controller.listar);
gestaoFornecedorRouter.put('/:id', exigirPerfil('SUPERVISOR'), validate({ body: atualizarFornecedorSchema }), controller.atualizar);
gestaoFornecedorRouter.patch('/:id/ativo', exigirPerfil('SUPERVISOR'), validate({ body: alterarAtivoSchema }), controller.mudarAtivo);
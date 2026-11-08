import { Router } from 'express';
import { exigirPerfil } from '../../middlewares/auth';
import * as controller from './acompanhamento.controller';

// Acompanhamento e gestão de pedidos de entrada (restrito a Almoxarifado, Compras e Supervisor)
export const acompanhamentoRouter = Router();

acompanhamentoRouter.get('/entradas', exigirPerfil('ALMOXARIFADO', 'COMPRAS', 'SUPERVISOR'), controller.listar);

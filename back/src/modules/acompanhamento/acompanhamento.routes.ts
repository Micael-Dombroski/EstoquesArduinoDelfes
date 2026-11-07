import { Router } from 'express';
import * as controller from './acompanhamento.controller';

// Acompanhamento de pedidos de entrada: somente leitura
export const acompanhamentoRouter = Router();

acompanhamentoRouter.get('/entradas', controller.listar);
import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { prisma } from './lib/prisma';
import { errorHandler } from './middlewares/errorHandler';
import { notFound } from './middlewares/notFound';

import { produtosRouter } from './modules/produtos/produtos.routes';
import { fornecedoresRouter } from './modules/fornecedores/fornecedores.routes';
import { requisitantesRouter } from './modules/requisitantes/requisitantes.routes';
import { pedidosEntradaRouter } from './modules/pedidos-entrada/pedidos-entrada.routes';
import { pedidosSaidaRouter } from './modules/pedidos-saida/pedidos-saida.routes';
import { movimentacoesRouter } from './modules/movimentacoes/movimentacoes.routes';
import { estoqueRouter } from './modules/estoque/estoque.routes';
import { reposicaoRouter } from './modules/reposicao/reposicao.routes';
import { authRouter } from './modules/auth/auth.routes';
import { usuariosRouter } from './modules/usuarios/usuarios.routes';
import { acompanhamentoRouter } from './modules/acompanhamento/acompanhamento.routes';
import { cadastroFornecedorRouter } from './modules/cadastro-fornecedor/cadastro-fornecedor.routes';
import { gestaoFornecedorRouter } from './modules/gestao-fornecedor/gestao-fornecedor.routes'; // ajuste o caminho

export const app = express();

app.use(cors({ origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()) }));
app.use(express.json());

const api = express.Router();

api.get('/health', async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ ok: true });
});

api.use('/auth', authRouter);
api.use('/usuarios', usuariosRouter);
api.use('/produtos', produtosRouter);
api.use('/fornecedores', fornecedoresRouter);
api.use('/requisitantes', requisitantesRouter);
api.use('/pedidos-entrada', pedidosEntradaRouter);
api.use('/pedidos-saida', pedidosSaidaRouter);
api.use('/movimentacoes', movimentacoesRouter);
api.use('/estoque', estoqueRouter);
api.use('/reposicao', reposicaoRouter);
api.use('/acompanhamento', acompanhamentoRouter);
api.use('/cadastro-fornecedor', cadastroFornecedorRouter);
api.use('/gestao-fornecedores', gestaoFornecedorRouter);

app.use('/api/v1', api);

// sempre por último: 404 para rotas inexistentes e tratamento central de erros
app.use(notFound);
app.use(errorHandler);

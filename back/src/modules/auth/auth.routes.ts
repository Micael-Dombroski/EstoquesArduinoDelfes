import { Router } from 'express';
import { autenticar } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import * as controller from './auth.controller';
import { loginSchema } from './auth.schemas';

export const authRouter = Router();

authRouter.post('/login', validate({ body: loginSchema }), controller.login);
authRouter.get('/me', autenticar, controller.me);
authRouter.get('/usuarios-demo', controller.usuariosDemo);


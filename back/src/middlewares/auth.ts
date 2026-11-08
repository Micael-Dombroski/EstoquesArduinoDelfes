import type { RequestHandler, Response } from 'express';
import { AppError } from '../shared/AppError';
import type { Perfil } from '../modules/auth/auth.schemas';
import { verificarToken, type UsuarioSessao } from '../modules/auth/auth.service';

function extrairBearer(header?: string): string | null {
  if (!header) return null;
  const [tipo, token] = header.split(' ');
  if (tipo?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

/** Exige que a requisição traga um token Bearer válido. */
export const autenticar: RequestHandler = (req, res, next) => {
  const token = extrairBearer(req.headers.authorization);
  if (!token) {
    throw new AppError(401, 'NAO_AUTENTICADO', 'Faça login para acessar este recurso.');
  }
  res.locals.usuario = verificarToken(token);
  next();
};

/**
 * Verifica se o usuário autenticado possui um dos perfis permitidos.
 * Se a requisição trouxer token, exige que o perfil esteja na lista.
 */
export const exigirPerfil =
  (...perfisPermitidos: Perfil[]): RequestHandler =>
  (req, res, next) => {
    const token = extrairBearer(req.headers.authorization);
    if (!token) {
      throw new AppError(401, 'NAO_AUTENTICADO', 'Faça login para realizar esta operação.');
    }
    const usuario = verificarToken(token);
    res.locals.usuario = usuario;

    if (!perfisPermitidos.includes(usuario.perfil)) {
      throw new AppError(
        403,
        'SEM_PERMISSAO',
        `Seu perfil (${usuario.perfil}) não tem permissão para realizar esta ação.`,
      );
    }
    next();
  };

export const usuarioAtual = (res: Response): UsuarioSessao => res.locals.usuario as UsuarioSessao;


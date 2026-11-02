import type { RequestHandler } from 'express';

export const notFound: RequestHandler = (req, res) => {
  res.status(404).json({
    error: {
      code: 'ROTA_NAO_ENCONTRADA',
      message: `Rota ${req.method} ${req.originalUrl} não encontrada`,
    },
  });
};

import type { NextFunction, Request, Response } from "express";
import { consultaSchema } from "./acompanhamento.schemas";
import { listarEntradas } from "./acompanhamento.service";

export async function listar(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = consultaSchema.safeParse(req.query);
    if (!parsed.success) {
      // Mesmo formato de erro do restante da API
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues[0]?.message ?? "Parâmetros inválidos.",
          details: parsed.error.issues,
        },
      });
    }
    res.json(await listarEntradas(parsed.data));
  } catch (e) {
    next(e);
  }
}

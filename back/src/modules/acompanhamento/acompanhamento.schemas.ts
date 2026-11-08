import { z } from "zod";

// Status que a tela conhece. O banco continua com os valores do enum do Prisma;
// este mapa é a única tradução entre os dois.
export const STATUS_TELA = ["pendente", "aprovado", "recusado", "a_caminho", "recebido", "cancelado"] as const;
export type StatusTela = (typeof STATUS_TELA)[number];

export const BANCO_POR_TELA: Record<StatusTela, string[]> = {
  pendente: ["RASCUNHO"],
  aprovado: ["APROVADO"],
  recusado: ["RECUSADO"],
  a_caminho: ["ENVIADO", "RECEBIDO_PARCIAL"],
  recebido: ["RECEBIDO"],
  cancelado: ["CANCELADO"],
};

export const TELA_POR_BANCO: Record<string, StatusTela> = Object.fromEntries(
  Object.entries(BANCO_POR_TELA).flatMap(([tela, bancos]) => bancos.map((b) => [b, tela as StatusTela])),
);

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (use AAAA-MM-DD).");

// Período opcional: ou vêm as duas datas, ou nenhuma; início <= fim; no máximo 1 ano.
function validarPeriodo(rotulo: string, de: string | undefined, ate: string | undefined, ctx: z.RefinementCtx) {
  if (!de && !ate) return;
  if (!de || !ate) {
    ctx.addIssue({ code: "custom", message: `Informe as duas datas do período ${rotulo}.` });
    return;
  }
  const d1 = new Date(`${de}T00:00:00Z`);
  const d2 = new Date(`${ate}T00:00:00Z`);
  if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) {
    ctx.addIssue({ code: "custom", message: `Data inválida no período ${rotulo}.` });
    return;
  }
  if (d1 > d2) ctx.addIssue({ code: "custom", message: `No período ${rotulo}, a data inicial não pode ser depois da final.` });
  const limite = new Date(d1);
  limite.setUTCFullYear(limite.getUTCFullYear() + 1);
  if (d2 > limite) ctx.addIssue({ code: "custom", message: `O período ${rotulo} não pode ser maior que 1 ano.` });
}

export const consultaSchema = z
  .object({
    pagina: z.coerce.number().int().min(1).default(1),
    limite: z.coerce.number().int().min(1).max(100).default(10),
    pedidoDe: dia.optional(),
    pedidoAte: dia.optional(),
    entregaDe: dia.optional(),
    entregaAte: dia.optional(),
    status: z.enum(STATUS_TELA).optional(),
    solicitanteId: z.coerce.number().int().positive().optional(),
  })
  .strict()
  .superRefine((q, ctx) => {
    validarPeriodo("do pedido", q.pedidoDe, q.pedidoAte, ctx);
    validarPeriodo("da previsão de entrega", q.entregaDe, q.entregaAte, ctx);
  });

export type Consulta = z.infer<typeof consultaSchema>;

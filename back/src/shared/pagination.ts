import { z } from 'zod';

export const paginacaoSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type Paginacao = z.infer<typeof paginacaoSchema>;

export const paginar = ({ page, pageSize }: Paginacao) => ({
  skip: (page - 1) * pageSize,
  take: pageSize,
});

export const respostaPaginada = <T>(data: T[], total: number, { page, pageSize }: Paginacao) => ({
  data,
  meta: { page, pageSize, total },
});

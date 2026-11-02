import { z } from 'zod';

// Aceita "12.5", "12,5" ou 12.5 e devolve SEMPRE string (o Prisma aceita string em Decimal).
const decimal = (casas: number) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim().replace(',', '.'))
    .pipe(
      z.string().regex(
        new RegExp(`^-?\\d{1,9}(\\.\\d{1,${casas}})?$`),
        `Número inválido (até ${casas} casas decimais)`,
      ),
    );

/** Decimal(12,3): quantidades. */
export const quantidadePositiva = decimal(3).refine((v) => Number(v) > 0, 'Deve ser maior que zero');
export const quantidadeNaoNegativa = decimal(3).refine((v) => Number(v) >= 0, 'Não pode ser negativa');
export const variacaoNaoZero = decimal(3).refine((v) => Number(v) !== 0, 'Não pode ser zero');

/** Decimal(12,2): valores monetários. */
export const valorNaoNegativo = decimal(2).refine((v) => Number(v) >= 0, 'Não pode ser negativo');

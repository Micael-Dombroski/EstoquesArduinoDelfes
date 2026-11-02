import { Prisma, PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../config/env';

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});

/** Cliente transacional recebido em prisma.$transaction(async (tx) => ...) */
export type Tx = Prisma.TransactionClient;

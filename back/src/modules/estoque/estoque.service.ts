import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { paginar, respostaPaginada, type Paginacao } from '../../shared/pagination';
import type { Parados, Situacao } from './estoque.schemas';

// Colunas de vw_estoque_situacao (extras.sql). numeric volta como Decimal e serializa como string.
type LinhaSituacao = {
  produto_id: number;
  codigo: string;
  nome: string;
  unidade: string;
  marca: string | null;
  saldo_atual: Prisma.Decimal;
  ponto_reposicao: Prisma.Decimal;
  semaforo: 'VERMELHO' | 'AMARELO' | 'VERDE';
  ultima_entrada: Date | null;
  ultima_saida: Date | null;
  dias_no_estoque: number | null;
  dias_sem_saida: number | null;
};

const mapear = (l: LinhaSituacao) => ({
  produtoId: l.produto_id,
  codigo: l.codigo,
  nome: l.nome,
  unidade: l.unidade,
  marca: l.marca,
  saldoAtual: l.saldo_atual,
  pontoReposicao: l.ponto_reposicao,
  semaforo: l.semaforo,
  ultimaEntrada: l.ultima_entrada,
  ultimaSaida: l.ultima_saida,
  diasNoEstoque: l.dias_no_estoque,
  diasSemSaida: l.dias_sem_saida,
});

const where = (condicoes: Prisma.Sql[]) =>
  condicoes.length > 0 ? Prisma.sql`WHERE ${Prisma.join(condicoes, ' AND ')}` : Prisma.empty;

/** Item parado: tem saldo e a última saída foi há >= N dias (ou nunca saiu e está no estoque há >= N dias). */
const condParado = (dias: number) => Prisma.sql`
  saldo_atual > 0 AND (
    dias_sem_saida >= ${dias}
    OR (ultima_saida IS NULL AND (dias_no_estoque IS NULL OR dias_no_estoque >= ${dias}))
  )`;

async function consultar(condicao: Prisma.Sql, ordem: Prisma.Sql, paginacao: Paginacao) {
  const { skip, take } = paginar(paginacao);
  const [linhas, contagem] = await Promise.all([
    prisma.$queryRaw<LinhaSituacao[]>`
      SELECT * FROM vw_estoque_situacao ${condicao} ${ordem} LIMIT ${take} OFFSET ${skip}`,
    prisma.$queryRaw<{ total: number }[]>`
      SELECT COUNT(*)::int AS total FROM vw_estoque_situacao ${condicao}`,
  ]);
  return respostaPaginada(linhas.map(mapear), contagem[0].total, paginacao);
}

/** Listagem com semáforo: vermelho primeiro. */
export function situacao(q: Situacao) {
  const condicoes: Prisma.Sql[] = [];
  if (q.semaforo) condicoes.push(Prisma.sql`semaforo = ${q.semaforo}`);
  if (q.q) {
    const termo = `%${q.q}%`;
    condicoes.push(Prisma.sql`(nome ILIKE ${termo} OR codigo ILIKE ${termo})`);
  }
  const ordem = Prisma.sql`ORDER BY CASE semaforo WHEN 'VERMELHO' THEN 0 WHEN 'AMARELO' THEN 1 ELSE 2 END, nome`;
  return consultar(where(condicoes), ordem, q);
}

export function parados(q: Parados) {
  const ordem = Prisma.sql`ORDER BY dias_sem_saida DESC NULLS FIRST, nome`;
  return consultar(where([condParado(q.dias)]), ordem, q);
}

/** Números do dashboard. */
export async function resumo() {
  const [porSemaforo, repor, parado] = await Promise.all([
    prisma.$queryRaw<{ semaforo: string; total: number }[]>`
      SELECT semaforo, COUNT(*)::int AS total FROM vw_estoque_situacao GROUP BY semaforo`,
    prisma.$queryRaw<{ total: number }[]>`
      SELECT COUNT(*)::int AS total FROM vw_sugestao_reposicao WHERE precisa_repor`,
    prisma.$queryRaw<{ total: number }[]>`
      SELECT COUNT(*)::int AS total FROM vw_estoque_situacao WHERE ${condParado(30)}`,
  ]);

  const semaforo = { VERMELHO: 0, AMARELO: 0, VERDE: 0 } as Record<string, number>;
  for (const l of porSemaforo) semaforo[l.semaforo] = l.total;

  return { semaforo, precisaRepor: repor[0].total, paradosHa30Dias: parado[0].total };
}

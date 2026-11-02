import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../shared/AppError';
import { obter as obterPedidoEntrada } from '../pedidos-entrada/pedidos-entrada.service';
import type { RascunhoBody, SugestoesQuery } from './reposicao.schemas';

// Colunas de vw_sugestao_reposicao (extras.sql)
type LinhaSugestao = {
  produto_id: number;
  codigo: string;
  nome: string;
  unidade: string;
  saldo_atual: Prisma.Decimal;
  qtd_pendente: Prisma.Decimal;
  ponto_reposicao: Prisma.Decimal;
  ponto_sugerido: Prisma.Decimal;
  consumo_medio_dia: Prisma.Decimal;
  dias_restantes: Prisma.Decimal | null;
  fornecedor_id: number | null;
  fornecedor_nome: string | null;
  prazo_entrega_dias: number | null;
  preco_unitario: Prisma.Decimal | null;
  precisa_repor: boolean;
  qtd_sugerida: Prisma.Decimal;
};

const mapear = (l: LinhaSugestao) => ({
  produtoId: l.produto_id,
  codigo: l.codigo,
  nome: l.nome,
  unidade: l.unidade,
  saldoAtual: l.saldo_atual,
  qtdPendente: l.qtd_pendente,
  pontoReposicao: l.ponto_reposicao,
  pontoSugerido: l.ponto_sugerido,
  consumoMedioDia: l.consumo_medio_dia,
  diasRestantes: l.dias_restantes,
  prazoEntregaDias: l.prazo_entrega_dias,
  precoUnitario: l.preco_unitario,
  precisaRepor: l.precisa_repor,
  qtdSugerida: l.qtd_sugerida,
});

/** Tela "O que comprar hoje": sugestões agrupadas por fornecedor. */
export async function sugestoes(query: SugestoesQuery) {
  const apenasPrecisaRepor = query.apenasPrecisaRepor ?? true;
  const filtro = apenasPrecisaRepor ? Prisma.sql`WHERE precisa_repor` : Prisma.empty;

  const linhas = await prisma.$queryRaw<LinhaSugestao[]>`
    SELECT * FROM vw_sugestao_reposicao ${filtro}
    ORDER BY fornecedor_nome NULLS LAST, dias_restantes NULLS LAST, nome`;

  // fornecedorId null = produtos sem fornecedor cadastrado (o front deve destacar)
  const grupos = new Map<
    number | null,
    { fornecedorId: number | null; fornecedorNome: string | null; itens: ReturnType<typeof mapear>[] }
  >();
  for (const l of linhas) {
    const grupo = grupos.get(l.fornecedor_id) ?? {
      fornecedorId: l.fornecedor_id,
      fornecedorNome: l.fornecedor_nome,
      itens: [],
    };
    grupo.itens.push(mapear(l));
    grupos.set(l.fornecedor_id, grupo);
  }

  return { data: [...grupos.values()], meta: { totalItens: linhas.length } };
}

/** Botão "Gerar pedido de entrada": cria um RASCUNHO já preenchido para o fornecedor. */
export async function gerarRascunho(input: RascunhoBody) {
  const pedidoId = await prisma.$transaction(async (tx) => {
    const fornecedor = await tx.fornecedor.findUnique({ where: { id: input.fornecedorId } });
    if (!fornecedor?.ativo) throw new AppError(422, 'FORNECEDOR_INVALIDO', 'Fornecedor inexistente ou inativo');

    const sugeridas = await tx.$queryRaw<LinhaSugestao[]>`
      SELECT * FROM vw_sugestao_reposicao
       WHERE precisa_repor AND fornecedor_id = ${input.fornecedorId}`;

    const escolhidas = input.itens
      ? input.itens.map((sel) => {
          const linha = sugeridas.find((l) => l.produto_id === sel.produtoId);
          if (!linha) {
            throw new AppError(422, 'ITEM_NAO_SUGERIDO', `O produto ${sel.produtoId} não está na sugestão deste fornecedor`);
          }
          return { linha, quantidade: sel.quantidade ?? linha.qtd_sugerida.toString() };
        })
      : sugeridas.map((linha) => ({ linha, quantidade: linha.qtd_sugerida.toString() }));

    const itens = escolhidas.filter((e) => Number(e.quantidade) > 0);
    if (itens.length === 0) throw new AppError(422, 'NADA_A_REPOR', 'Nenhum produto a repor para este fornecedor');

    // marca padrão do produto como ponto de partida (o usuário pode ajustar no rascunho)
    const produtos = await tx.produto.findMany({
      where: { id: { in: itens.map((i) => i.linha.produto_id) } },
      select: { id: true, marca: true },
    });

    const pedido = await tx.pedidoEntrada.create({
      data: {
        fornecedorId: input.fornecedorId,
        observacao: 'Rascunho gerado a partir da sugestão de reposição',
        itens: {
          create: itens.map(({ linha, quantidade }) => ({
            produtoId: linha.produto_id,
            quantidade,
            precoUnitario: linha.preco_unitario,
            marca: produtos.find((p) => p.id === linha.produto_id)?.marca ?? null,
          })),
        },
      },
      select: { id: true },
    });
    return pedido.id;
  });

  return obterPedidoEntrada(pedidoId);
}

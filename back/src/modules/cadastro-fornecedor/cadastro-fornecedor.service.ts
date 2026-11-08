import { prisma } from '../../lib/prisma';
import { formatarCnpj, somenteDigitos, type CriarFornecedor } from './cadastro-fornecedor.schemas';

export class ErroCadastro extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: unknown[] = [],
  ) {
    super(message);
  }
}

// Fornecedor + produtos novos + vínculos numa única transação: ou entra tudo, ou nada.
export async function cadastrarFornecedor(d: CriarFornecedor) {
  const cnpj = d.cnpj ? formatarCnpj(somenteDigitos(d.cnpj)) : null;
  const idsExistentes = d.produtos.flatMap((p) => ('produtoId' in p ? [p.produtoId] : []));
  const novos = d.produtos.flatMap((p) => ('novoProduto' in p ? [p.novoProduto] : []));

  try {
    return await prisma.$transaction(async (tx) => {
      if (cnpj && (await tx.fornecedor.findUnique({ where: { cnpj }, select: { id: true } }))) {
        throw new ErroCadastro(409, 'CNPJ_DUPLICADO', 'Já existe um fornecedor com este CNPJ.');
      }

      // Produtos já cadastrados: precisam existir e estar ativos
      if (idsExistentes.length > 0) {
        const validos = await tx.produto.findMany({
          where: { id: { in: idsExistentes }, ativo: true },
          select: { id: true },
        });
        if (validos.length !== idsExistentes.length) {
          const ok = new Set(validos.map((p) => p.id));
          throw new ErroCadastro(
            422,
            'PRODUTO_INVALIDO',
            'Há produtos inexistentes ou inativos na lista.',
            idsExistentes.filter((id) => !ok.has(id)).map((produtoId) => ({ produtoId })),
          );
        }
      }

      // Produtos novos: o código não pode já existir
      if (novos.length > 0) {
        const jaExistem = await tx.produto.findMany({
          where: { codigo: { in: novos.map((n) => n.codigo) } },
          select: { codigo: true },
        });
        if (jaExistem.length > 0) {
          throw new ErroCadastro(
            409,
            'CODIGO_DUPLICADO',
            'Já existe um produto com este código.',
            jaExistem.map((p) => ({ codigo: p.codigo })),
          );
        }
      }

      // Cria os produtos novos. saldoAtual NÃO é enviado: o default do banco é 0
      // e só o trigger de movimentação pode alterá-lo.
      const idPorCodigo = new Map<string, number>();
      for (const n of novos) {
        const criado = await tx.produto.create({
          data: {
            codigo: n.codigo,
            nome: n.nome,
            unidade: n.unidade,
            marca: n.marca ?? null,
            pontoReposicao: n.pontoReposicao ?? 0,
          },
          select: { id: true },
        });
        idPorCodigo.set(n.codigo, criado.id);
      }

      // Todas as linhas passam a ter um produtoId (existente ou recém-criado)
      const linhas = d.produtos.map((p) => ({
        produtoId: 'produtoId' in p ? p.produtoId : idPorCodigo.get(p.novoProduto.codigo)!,
        prazoEntregaDias: p.prazoEntregaDias,
        precoUnitario: p.precoUnitario ?? null,
        preferencial: p.preferencial,
      }));

      const fornecedor = await tx.fornecedor.create({
        data: {
          nome: d.nome,
          cnpj,
          contato: d.contato ?? null,
          email: d.email ?? null,
          telefone: d.telefone ?? null,
          valorMinimoPedido: d.valorMinimoPedido ?? null,
          ativo: true,
        },
      });

      // Só pode haver um preferencial por produto (índice único parcial): o novo substitui o atual.
      const preferidos = linhas.filter((l) => l.preferencial).map((l) => l.produtoId);
      if (preferidos.length > 0) {
        await tx.produtoFornecedor.updateMany({
          where: { produtoId: { in: preferidos }, preferencial: true },
          data: { preferencial: false },
        });
      }

      await tx.produtoFornecedor.createMany({
        data: linhas.map((l) => ({ ...l, fornecedorId: fornecedor.id })),
      });

      return tx.fornecedor.findUniqueOrThrow({
        where: { id: fornecedor.id },
        include: {
          produtos: {
            orderBy: { produtoId: 'asc' },
            include: { produto: { select: { id: true, codigo: true, nome: true, unidade: true } } },
          },
        },
      });
    });
  } catch (e) {
    if (e instanceof ErroCadastro) throw e;
    // Violação de unicidade por corrida (dois cadastros ao mesmo tempo)
    if ((e as { code?: string }).code === 'P2002') {
      throw new ErroCadastro(409, 'CONFLITO', 'Outro cadastro foi feito ao mesmo tempo. Atualize a página e tente de novo.');
    }
    throw e;
  }
}
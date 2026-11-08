import { prisma } from '../../lib/prisma';
import { ErroCadastro } from '../cadastro-fornecedor/cadastro-fornecedor.service';
import { formatarCnpj, somenteDigitos } from '../cadastro-fornecedor/cadastro-fornecedor.schemas';
import type { AtualizarFornecedor } from './gestao-fornecedor.schemas';

const incluirProdutos = {
  produtos: {
    orderBy: { produto: { nome: 'asc' } },
    include: { produto: { select: { id: true, codigo: true, nome: true, unidade: true } } },
  },
} as const;

export function listarFornecedores(ativo: boolean) {
  return prisma.fornecedor.findMany({
    where: { ativo },
    orderBy: { nome: 'asc' },
    include: incluirProdutos,
  });
}

export async function atualizarFornecedor(id: number, d: AtualizarFornecedor) {
  const cnpj = d.cnpj ? formatarCnpj(somenteDigitos(d.cnpj)) : null;

  try {
    return await prisma.$transaction(async (tx) => {
      const existe = await tx.fornecedor.findUnique({ where: { id }, select: { id: true } });
      if (!existe) throw new ErroCadastro(404, 'NAO_ENCONTRADO', 'Fornecedor não encontrado.');

      if (cnpj) {
        const outro = await tx.fornecedor.findFirst({ where: { cnpj, NOT: { id } }, select: { id: true } });
        if (outro) throw new ErroCadastro(409, 'CNPJ_DUPLICADO', 'Já existe um fornecedor com este CNPJ.');
      }

      await tx.fornecedor.update({
        where: { id },
        data: {
          nome: d.nome,
          cnpj,
          contato: d.contato ?? null,
          email: d.email ?? null,
          telefone: d.telefone ?? null,
          valorMinimoPedido: d.valorMinimoPedido ?? null,
        },
      });

      for (const p of d.produtos) {
        // Só pode haver um preferencial por produto (índice único parcial): tira o dos outros antes.
        if (p.preferencial) {
          await tx.produtoFornecedor.updateMany({
            where: { produtoId: p.produtoId, preferencial: true, NOT: { fornecedorId: id } },
            data: { preferencial: false },
          });
        }
        const r = await tx.produtoFornecedor.updateMany({
          where: { produtoId: p.produtoId, fornecedorId: id },
          data: {
            prazoEntregaDias: p.prazoEntregaDias,
            precoUnitario: p.precoUnitario ?? null,
            preferencial: p.preferencial,
          },
        });
        if (r.count === 0) {
          throw new ErroCadastro(422, 'PRODUTO_INVALIDO', 'Produto não vinculado a este fornecedor.', [
            { produtoId: p.produtoId },
          ]);
        }
      }

      return tx.fornecedor.findUniqueOrThrow({ where: { id }, include: incluirProdutos });
    });
  } catch (e) {
    if (e instanceof ErroCadastro) throw e;
    if ((e as { code?: string }).code === 'P2002') {
      throw new ErroCadastro(409, 'CNPJ_DUPLICADO', 'Já existe um fornecedor com este CNPJ.');
    }
    throw e;
  }
}

export async function alterarAtivo(id: number, ativo: boolean) {
  try {
    return await prisma.fornecedor.update({ where: { id }, data: { ativo }, select: { id: true, ativo: true } });
  } catch (e) {
    if ((e as { code?: string }).code === 'P2025') {
      throw new ErroCadastro(404, 'NAO_ENCONTRADO', 'Fornecedor não encontrado.');
    }
    throw e;
  }
}
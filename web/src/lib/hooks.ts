import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";
import { api, unwrapList, unwrapOne, unwrapPage } from "./api";
import type {
  GrupoSugestao,
  PedidoEntrada,
  Produto,
  RecebimentoEntrada,
  Requisitante,
  Retirada,
  StatusPedidoEntrada,
  StatusRecebimento,
} from "./types";

// O catálogo é carregado uma vez e filtrado no cliente (busca instantânea).
export const useProdutos = () =>
  useQuery({
    queryKey: ["produtos"],
    queryFn: async () => unwrapList<Produto>(await api("/produtos")),
    staleTime: 60_000,
  });

export const useRequisitantes = () =>
  useQuery({
    queryKey: ["requisitantes"],
    queryFn: async () => unwrapList<Requisitante>(await api("/requisitantes")),
    staleTime: 5 * 60_000,
  });

// Sempre fresco: o gestor precisa ver o saldo real ao voltar para a aba.
export const useSugestoes = () =>
  useQuery({
    queryKey: ["reposicao", "sugestoes"],
    queryFn: async () => unwrapList<GrupoSugestao>(await api("/reposicao/sugestoes")),
    staleTime: 0,
  });

export const usePedidosEntrada = (status?: StatusPedidoEntrada, habilitado = true) =>
  useQuery({
    queryKey: ["pedidos-entrada", status ?? "TODOS"],
    enabled: habilitado,
    queryFn: async () => {
      const q = new URLSearchParams({ limite: "50" });
      if (status) q.set("status", status);
      return unwrapList<PedidoEntrada>(await api(`/pedidos-entrada?${q}`));
    },
    staleTime: 10_000,
  });

export const useRecebimentos = (status?: StatusRecebimento, habilitado = true) =>
  useQuery({
    queryKey: ["recebimentos-entrada", status ?? "TODOS"],
    enabled: habilitado,
    queryFn: async () => {
      const q = new URLSearchParams();
      if (status) q.set("status", status);
      return unwrapList<RecebimentoEntrada>(await api(`/pedidos-entrada/recebimentos?${q}`));
    },
    staleTime: 5_000,
  });

export const useSaidasPendentes = (habilitado = true) =>
  useQuery({
    queryKey: ["saidas-pendentes"],
    enabled: habilitado,
    queryFn: async () => {
      const q = new URLSearchParams({ status: "PENDENTE", limite: "50" });
      return unwrapList<Retirada>(await api(`/pedidos-saida?${q}`));
    },
    staleTime: 5_000,
  });

// ----- Histórico de retiradas -----
export type FiltrosHistorico = { de: string; ate: string; produtoId: string; requisitanteId: string };

// Nomes dos parâmetros de query esperados pela API. Se forem outros, ajuste só aqui.
const PARAMS = {
  pagina: "pagina",
  limite: "limite",
  de: "de",
  ate: "ate",
  produto: "produtoId",
  requisitante: "requisitanteId",
} as const;

// Período enviado como instantes ISO: do início do dia inicial ao fim do dia final (horário local).
const inicioDoDia = (dia: string) => new Date(`${dia}T00:00:00`).toISOString();
const fimDoDia = (dia: string) => new Date(`${dia}T23:59:59.999`).toISOString();

export const useHistoricoSaidas = (filtros: FiltrosHistorico | null, pagina: number, limite: number) =>
  useQuery({
    queryKey: ["historico-saidas", filtros, pagina, limite],
    enabled: filtros !== null,
    retry: false, // erro aparece na hora; o usuário tenta de novo em "Atualizar lista"
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const f = filtros!;
      const q = new URLSearchParams({
        [PARAMS.pagina]: String(pagina),
        [PARAMS.limite]: String(limite),
        [PARAMS.de]: inicioDoDia(f.de),
        [PARAMS.ate]: fimDoDia(f.ate),
      });
      if (f.produtoId) q.set(PARAMS.produto, f.produtoId);
      if (f.requisitanteId) q.set(PARAMS.requisitante, f.requisitanteId);
      return unwrapPage<Retirada>(await api(`/pedidos-saida?${q}`));
    },
  });

// Se a listagem não traz os itens, busca o detalhe (GET /pedidos-saida/:id) de cada retirada visível.
export const useDetalhesRetiradas = (ids: number[]) =>
  useQueries({
    queries: ids.map((id) => ({
      queryKey: ["retirada", id],
      queryFn: async () => unwrapOne<Retirada>(await api(`/pedidos-saida/${id}`)),
      staleTime: 30_000,
      retry: false,
    })),
  });

import { useQuery } from "@tanstack/react-query";
import { api, unwrapList } from "./api";
import type { GrupoSugestao, Produto, Requisitante } from "./types";

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

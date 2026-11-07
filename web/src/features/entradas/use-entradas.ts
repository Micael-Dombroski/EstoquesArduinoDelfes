import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, unwrapPage } from "@/lib/api";
import type { FiltrosEntradas, PedidoEntradaAcomp } from "./tipos";

const CHAVES = ["pedidoDe", "pedidoAte", "entregaDe", "entregaAte", "status", "solicitanteId"] as const;

export const useAcompanhamentoEntradas = (filtros: FiltrosEntradas | null, pagina: number, limite: number) =>
  useQuery({
    queryKey: ["acompanhamento-entradas", filtros, pagina, limite],
    enabled: filtros !== null,
    retry: false, // o erro aparece na hora; o usuário tenta de novo em "Atualizar lista"
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const q = new URLSearchParams({ pagina: String(pagina), limite: String(limite) });
      for (const k of CHAVES) if (filtros![k]) q.set(k, filtros![k]);
      return unwrapPage<PedidoEntradaAcomp>(await api(`/acompanhamento/entradas?${q}`));
    },
  });

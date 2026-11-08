"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { podeBaixarRetirada, podeDesfazerRetirada, useSessao } from "@/lib/auth";
import { mensagemDeErro } from "@/lib/errors";
import { codigoOc, fmt, fmtDataHora, normaliza } from "@/lib/format";
import { useProdutos, useRequisitantes, useSaidasPendentes } from "@/lib/hooks";
import type { Faltante, ItemRetirada, Produto, Retirada, SituacaoFaltanteSaida } from "@/lib/types";

const CHAVE_REQUISITANTE = "estoque:requisitanteId";

type EstadoItemSeparacao = {
  separado: boolean;
  quantidadeSeparada: string;
  situacaoFaltante: SituacaoFaltanteSaida;
};

function sugerirSituacaoFaltante(item: ItemRetirada): SituacaoFaltanteSaida {
  if (item.situacaoFaltante === "A_CAMINHO" || item.situacaoFaltante === "NECESSITA_COMPRA") {
    return item.situacaoFaltante;
  }
  const temOcACaminho = (item.produto?.itensEntrada ?? []).some(
    (ie) => ie.pedido.status === "ENVIADO" || ie.pedido.status === "RECEBIDO_PARCIAL",
  );
  return temOcACaminho ? "A_CAMINHO" : "NECESSITA_COMPRA";
}

function estadoInicialItem(item: ItemRetirada, saldoFallback?: string): EstadoItemSeparacao {
  const jaSalvo =
    Boolean(item.separado) || Number(item.quantidadeSeparada ?? 0) > 0 || Boolean(item.situacaoFaltante);
  if (jaSalvo) {
    return {
      separado: Boolean(item.separado),
      quantidadeSeparada: item.quantidadeSeparada ?? "0",
      situacaoFaltante: sugerirSituacaoFaltante(item),
    };
  }
  const solicitado = Number(item.quantidade);
  const saldo = Number(item.produto?.saldoAtual ?? saldoFallback ?? solicitado);
  const disponivel = Math.max(0, Math.min(solicitado, saldo));
  return {
    separado: disponivel > 0,
    quantidadeSeparada: String(disponivel),
    situacaoFaltante: sugerirSituacaoFaltante(item),
  };
}

export function SaidaForm() {
  const qc = useQueryClient();
  const { usuario } = useSessao();
  const { data: produtos = [] } = useProdutos();
  const { data: requisitantes = [] } = useRequisitantes();
  const { data: pendentes = [] } = useSaidasPendentes(true);

  const busca = useRef<HTMLInputElement>(null);
  const [termo, setTermo] = useState("");
  const [carrinho, setCarrinho] = useState<Record<number, number>>({});
  const [observacao, setObservacao] = useState("");
  const [requisitanteManual, setRequisitanteManual] = useState(() => {
    if (typeof window === "undefined") return "";
    try {
      return localStorage.getItem(CHAVE_REQUISITANTE) ?? "";
    } catch {
      return "";
    }
  });
  const [faltantes, setFaltantes] = useState<Record<number, string>>({});

  // Estado local de edição da separação por itemId
  const [separacaoPorItem, setSeparacaoPorItem] = useState<Record<number, EstadoItemSeparacao>>({});

  const requisitanteId = requisitanteManual || (usuario?.requisitanteId ? String(usuario.requisitanteId) : "");
  const permiteDarBaixa = podeBaixarRetirada(usuario?.perfil);

  // "/" leva o foco para a busca de qualquer lugar da tela.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "SELECT", "TEXTAREA"].includes(alvo.tagName)) {
        e.preventDefault();
        busca.current?.focus();
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

  const porId = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);

  const resultados = useMemo(() => {
    const t = normaliza(termo);
    if (!t) return [];
    return produtos
      .filter((p) => p.ativo && (normaliza(p.nome).includes(t) || normaliza(p.codigo).includes(t)))
      .slice(0, 8);
  }, [produtos, termo]);

  function lerEstadoItem(item: ItemRetirada): EstadoItemSeparacao {
    return separacaoPorItem[item.id] ?? estadoInicialItem(item, porId.get(item.produtoId)?.saldoAtual);
  }

  function atualizarItemSeparacao(item: ItemRetirada, parcial: Partial<EstadoItemSeparacao>) {
    setSeparacaoPorItem((prev) => {
      const atual = prev[item.id] ?? estadoInicialItem(item, porId.get(item.produtoId)?.saldoAtual);
      return {
        ...prev,
        [item.id]: { ...atual, ...parcial },
      };
    });
  }

  function montarPayloadSeparacao(solicitacao: Retirada) {
    return (solicitacao.itens ?? []).map((item) => {
      const est = lerEstadoItem(item);
      const qtdNum = est.separado ? Math.max(0, Number(est.quantidadeSeparada.replace(",", ".")) || 0) : 0;
      const solicitado = Number(item.quantidade);
      const temFalta = !est.separado || qtdNum < solicitado;
      return {
        itemId: item.id,
        separado: est.separado && qtdNum > 0,
        quantidadeSeparada: String(qtdNum),
        situacaoFaltante: temFalta ? est.situacaoFaltante : null,
      };
    });
  }

  function adicionar(p: Produto) {
    setCarrinho((c) => ({ ...c, [p.id]: (c[p.id] ?? 0) + 1 }));
    setFaltantes({});
    setTermo("");
    busca.current?.focus();
  }

  function alterar(id: number, delta: number) {
    setCarrinho((c) => {
      const proximo = (c[id] ?? 0) + delta;
      const copia = { ...c };
      delete copia[id];
      return proximo > 0 ? { ...copia, [id]: proximo } : copia;
    });
    setFaltantes({});
  }

  function definirQuantidade(id: number, valor: string) {
    const num = Number(valor.replace(",", "."));
    if (!valor.trim() || Number.isNaN(num) || num <= 0) {
      setCarrinho((c) => {
        const copia = { ...c };
        delete copia[id];
        return copia;
      });
      return;
    }
    setCarrinho((c) => ({ ...c, [id]: num }));
    setFaltantes({});
  }

  async function desfazer(pedidoId: number) {
    try {
      await api(`/pedidos-saida/${pedidoId}/cancelar`, { method: "POST" });
      qc.invalidateQueries();
      toast.success("Retirada desfeita");
    } catch (e) {
      toast.error(mensagemDeErro(e));
    }
  }

  const enviar = useMutation({
    mutationFn: (comoPendente: boolean) =>
      api<{ id?: number; status?: string; data?: { id: number; status?: string } }>("/pedidos-saida", {
        method: "POST",
        body: JSON.stringify({
          requisitanteId: Number(requisitanteId),
          observacao: observacao.trim() || null,
          pendente: comoPendente,
          itens: Object.entries(carrinho).map(([produtoId, q]) => ({
            produtoId: Number(produtoId),
            quantidade: String(q),
          })),
        }),
      }),
    onSuccess: (res, comoPendente) => {
      const id = res?.id ?? res?.data?.id;
      const statusCriado = res?.status ?? res?.data?.status;
      const ficouPendente = comoPendente || statusCriado === "PENDENTE";
      setCarrinho({});
      setObservacao("");
      setFaltantes({});
      qc.invalidateQueries();
      if (ficouPendente) {
        toast.success(
          "Solicitação de retirada enviada! O Almoxarifado fará a separação dos materiais e a baixa no estoque.",
          { duration: 6000 },
        );
      } else {
        toast.success("Retirada registrada e baixa efetuada no estoque", {
          duration: 8000,
          action:
            id && podeDesfazerRetirada(usuario?.perfil)
              ? { label: "Desfazer", onClick: () => desfazer(id) }
              : undefined,
        });
      }
      busca.current?.focus();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === "SALDO_INSUFICIENTE") {
        const mapa: Record<number, string> = {};
        for (const d of e.details as Faltante[]) mapa[d.produtoId] = d.saldoAtual;
        setFaltantes(mapa);
      }
      toast.error(mensagemDeErro(e));
    },
  });

  const salvarSeparacao = useMutation({
    mutationFn: (solicitacao: Retirada) =>
      api(`/pedidos-saida/${solicitacao.id}/separacao`, {
        method: "PATCH",
        body: JSON.stringify({
          itens: montarPayloadSeparacao(solicitacao),
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Conferência de separação salva! Os itens separados e faltantes foram atualizados.");
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const baixar = useMutation({
    mutationFn: (solicitacao: Retirada) =>
      api(`/pedidos-saida/${solicitacao.id}/baixar`, {
        method: "POST",
        body: JSON.stringify({
          itens: montarPayloadSeparacao(solicitacao),
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Baixa realizada com sucesso! Os itens separados foram descontados do estoque.");
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const cancelarPendente = useMutation({
    mutationFn: (pedidoId: number) => api(`/pedidos-saida/${pedidoId}/cancelar`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Solicitação de retirada cancelada.");
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const itens = Object.keys(carrinho).length;
  const podeConfirmar = itens > 0 && requisitanteId !== "" && !enviar.isPending;

  return (
    <div
      className="space-y-6"
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.ctrlKey && podeConfirmar) {
          enviar.mutate(!permiteDarBaixa);
        }
      }}
    >
      <div className="relative">
        <label htmlFor="busca" className="mb-2 block text-sm font-medium">
          Buscar produto por nome ou código
        </label>
        <input
          id="busca"
          ref={busca}
          autoFocus
          autoComplete="off"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setTermo("");
            if (e.key === "Enter" && !e.ctrlKey && resultados.length > 0) {
              e.preventDefault();
              const exato = resultados.find((p) => normaliza(p.codigo) === normaliza(termo));
              adicionar(exato ?? resultados[0]);
            }
          }}
          placeholder="Digite ou passe o leitor. Enter adiciona à lista."
          className="h-12 w-full rounded-lg border border-slate-300 bg-white px-4 text-base focus-visible:outline-2 focus-visible:outline-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus-visible:outline-blue-400"
        />
        {resultados.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
            {resultados.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => adicionar(p)}
                  className="flex min-h-11 w-full items-center justify-between px-4 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <span>
                    <span className="font-medium">{p.nome}</span>
                    <span className="ml-2 text-sm text-slate-500 dark:text-slate-400">{p.codigo}</span>
                  </span>
                  <span className="text-sm text-slate-600 dark:text-slate-400">
                    {fmt(p.saldoAtual)} {p.unidade}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {termo && resultados.length === 0 && (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Nenhum produto encontrado para “{termo}”.</p>
        )}
      </div>

      <section aria-label="Itens da lista de retirada">
        {itens === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-600 dark:border-slate-700 dark:text-slate-400">
            Nenhum item na lista. Busque um produto acima para montar a solicitação de retirada.
          </p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
            {Object.entries(carrinho).map(([id, qtd]) => {
              const p = porId.get(Number(id));
              const faltou = faltantes[Number(id)];
              return (
                <li
                  key={id}
                  className={`flex items-center justify-between gap-3 p-4 ${faltou !== undefined ? "bg-red-50 dark:bg-red-950/40" : ""}`}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p?.nome ?? `Produto ${id}`}</p>
                    <p
                      className={`text-sm ${faltou !== undefined ? "font-medium text-red-700 dark:text-red-400" : "text-slate-600 dark:text-slate-400"}`}
                    >
                      {faltou !== undefined
                        ? `Saldo insuficiente: restam ${fmt(faltou)} ${p?.unidade ?? ""}`
                        : `Em estoque: ${p ? fmt(p.saldoAtual) : "-"} ${p?.unidade ?? ""}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={`Diminuir ${p?.nome ?? "item"}`}
                      onClick={() => alterar(Number(id), -1)}
                      className="size-11 rounded-lg border border-slate-300 text-xl hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min="1"
                      step="any"
                      aria-label={`Quantidade de ${p?.nome ?? "item"}`}
                      value={qtd}
                      onChange={(e) => definirQuantidade(Number(id), e.target.value)}
                      className="h-11 w-16 rounded-lg border border-slate-300 bg-white px-2 text-center text-base font-semibold tabular-nums dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      aria-label={`Aumentar ${p?.nome ?? "item"}`}
                      onClick={() => alterar(Number(id), 1)}
                      className="size-11 rounded-lg border border-slate-300 text-xl hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      +
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-2">
        <div>
          <label htmlFor="requisitante" className="mb-1.5 block text-sm font-medium">
            Destinatário do material (funcionário / setor)
          </label>
          <select
            id="requisitante"
            value={requisitanteId}
            onChange={(e) => {
              setRequisitanteManual(e.target.value);
              try {
                localStorage.setItem(CHAVE_REQUISITANTE, e.target.value);
              } catch {}
            }}
            className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-blue-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus-visible:outline-blue-400"
          >
            <option value="">Selecione o destinatário</option>
            {requisitantes
              .filter((r) => r.ativo)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                  {r.setor ? ` (${r.setor})` : ""}
                </option>
              ))}
          </select>
        </div>

        <div>
          <label htmlFor="observacao-saida" className="mb-1.5 block text-sm font-medium">
            Complemento do destinatário / Observação (opcional)
          </label>
          <input
            id="observacao-saida"
            type="text"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Ex.: Bancada 3, Projeto Arduino, Ordem de serviço..."
            className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-blue-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus-visible:outline-blue-400"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 sm:col-span-2">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {permiteDarBaixa
              ? "Você pode enviar como solicitação para separação ou já registrar a baixa imediata no estoque."
              : "Sua solicitação será enviada ao Almoxarifado e ao Supervisor para separação e baixa no estoque."}
          </p>

          <div className="flex flex-wrap gap-2">
            {permiteDarBaixa ? (
              <>
                <button
                  type="button"
                  disabled={!podeConfirmar}
                  onClick={() => enviar.mutate(true)}
                  className="h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Enviar para separação (pendente)
                </button>
                <button
                  type="button"
                  disabled={!podeConfirmar}
                  onClick={() => enviar.mutate(false)}
                  className="h-11 rounded-lg bg-emerald-700 px-5 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300 dark:bg-emerald-600 dark:hover:bg-emerald-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
                >
                  {enviar.isPending ? "Registrando..." : "Registrar e dar baixa agora"}
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={!podeConfirmar}
                onClick={() => enviar.mutate(true)}
                className="h-11 rounded-lg bg-blue-700 px-6 text-sm font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300 dark:bg-blue-600 dark:hover:bg-blue-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
              >
                {enviar.isPending ? "Enviando..." : "Enviar solicitação de retirada"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Painel detalhado de Separação e Baixa das solicitações enviadas */}
      {pendentes.length > 0 && (
        <section
          aria-labelledby="titulo-saidas-pendentes"
          className="space-y-4 rounded-xl border border-amber-300 bg-amber-50/50 p-4 dark:border-amber-900/60 dark:bg-amber-950/20"
        >
          <div>
            <h2 id="titulo-saidas-pendentes" className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Separação de materiais e baixa no estoque ({pendentes.length})
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {permiteDarBaixa
                ? "Marque os itens separados, informe a quantidade separada e indique se os itens faltantes necessitam de compra ou já estão a caminho."
                : "Acompanhe abaixo quais itens da sua solicitação já foram separados pelo Almoxarifado e a situação de eventuais itens faltantes."}
            </p>
          </div>

          <ul className="space-y-4">
            {pendentes.map((s) => {
              const listaItens = s.itens ?? [];
              let qtdCompletos = 0;
              let qtdComFalta = 0;
              for (const item of listaItens) {
                const est = lerEstadoItem(item);
                const sepNum = est.separado ? Number(est.quantidadeSeparada.replace(",", ".")) || 0 : 0;
                if (est.separado && sepNum >= Number(item.quantidade)) {
                  qtdCompletos++;
                } else {
                  qtdComFalta++;
                }
              }

              return (
                <li
                  key={s.id}
                  className="rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900"
                >
                  {/* Cabeçalho da solicitação */}
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-800">
                    <div className="space-y-0.5">
                      <p className="font-semibold text-slate-900 dark:text-slate-100">
                        Solicitação #{s.id} · Destinatário:{" "}
                        <span className="text-blue-700 dark:text-blue-400">
                          {s.requisitante?.nome ?? `Funcionário #${s.requisitanteId}`}
                        </span>
                        {s.requisitante?.setor && (
                          <span className="font-normal text-slate-500 dark:text-slate-400">
                            {" "}
                            ({s.requisitante.setor})
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Solicitado em {fmtDataHora(s.dataPedido)}
                        {s.observacao ? ` · Destino/Obs.: ${s.observacao}` : ""}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
                        {qtdCompletos} de {listaItens.length} separados
                      </span>
                      {qtdComFalta > 0 && (
                        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950/80 dark:text-amber-300">
                          {qtdComFalta} {qtdComFalta === 1 ? "item pendente/faltando" : "itens pendentes/faltando"}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Itens com detalhes de separação */}
                  <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                    {listaItens.map((i) => {
                      const prod = porId.get(i.produtoId);
                      const codigo = i.produto?.codigo ?? prod?.codigo;
                      const marca = i.produto?.marca;
                      const un = i.produto?.unidade ?? prod?.unidade ?? "un";
                      const saldoStr = i.produto?.saldoAtual ?? prod?.saldoAtual;
                      const saldoNum = saldoStr !== undefined ? Number(saldoStr) : null;
                      const solicitadoNum = Number(i.quantidade);

                      const est = lerEstadoItem(i);
                      const qtdSepNum = est.separado
                        ? Math.max(0, Number(est.quantidadeSeparada.replace(",", ".")) || 0)
                        : 0;
                      const qtdFaltante = Math.max(0, Number((solicitadoNum - qtdSepNum).toFixed(3)));
                      const saldoInsuficiente = saldoNum !== null && saldoNum < solicitadoNum;

                      const entradasAtivas = i.produto?.itensEntrada ?? [];
                      const ocACaminho = entradasAtivas.find(
                        (ie) => ie.pedido.status === "ENVIADO" || ie.pedido.status === "RECEBIDO_PARCIAL",
                      );
                      const rascunhoCompra = entradasAtivas.find(
                        (ie) => ie.pedido.status === "RASCUNHO" || ie.pedido.status === "APROVADO",
                      );

                      return (
                        <li key={i.id} className="space-y-2.5 p-4 text-sm">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-slate-900 dark:text-slate-100">
                                  {i.produto?.nome ?? prod?.nome ?? `Produto #${i.produtoId}`}
                                </span>
                                {codigo && (
                                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                    {codigo}
                                  </span>
                                )}
                                {marca && (
                                  <span className="text-xs text-slate-500 dark:text-slate-400">· Marca: {marca}</span>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                                <span className="text-slate-600 dark:text-slate-300">
                                  Solicitado: <strong>{fmt(i.quantidade)} {un}</strong>
                                </span>
                                {saldoStr !== undefined && (
                                  <span
                                    className={
                                      saldoInsuficiente
                                        ? "font-semibold text-red-700 dark:text-red-400"
                                        : "text-emerald-700 dark:text-emerald-400"
                                    }
                                  >
                                    Saldo em estoque: {fmt(saldoStr)} {un}
                                  </span>
                                )}
                                {ocACaminho && (
                                  <span className="rounded bg-indigo-50 px-2 py-0.5 font-medium text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300">
                                    OC ativa: {codigoOc(ocACaminho.pedido)} (
                                    {fmt(
                                      Math.max(
                                        0,
                                        Number(ocACaminho.quantidade) - Number(ocACaminho.quantidadeRecebida),
                                      ),
                                    )}{" "}
                                    {un} a caminho)
                                  </span>
                                )}
                                {!ocACaminho && rascunhoCompra && (
                                  <span className="rounded bg-amber-50 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                                    Solicitação de compra #{rascunhoCompra.pedido.id} em revisão
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Controles de separação para Almoxarifado / Supervisor ou Status para Solicitante */}
                            {permiteDarBaixa ? (
                              <div className="flex flex-wrap items-center gap-3">
                                <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-800 dark:text-slate-200">
                                  <input
                                    type="checkbox"
                                    checked={est.separado}
                                    onChange={(e) => {
                                      const marcado = e.target.checked;
                                      const padraoQtd =
                                        saldoNum !== null
                                          ? String(Math.max(0, Math.min(solicitadoNum, saldoNum)))
                                          : i.quantidade;
                                      atualizarItemSeparacao(i, {
                                        separado: marcado,
                                        quantidadeSeparada:
                                          marcado && Number(est.quantidadeSeparada) <= 0
                                            ? padraoQtd
                                            : marcado
                                              ? est.quantidadeSeparada
                                              : "0",
                                      });
                                    }}
                                    className="size-4 accent-emerald-600"
                                  />
                                  Separado
                                </label>

                                <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                                  Qtd. separada:
                                  <input
                                    type="number"
                                    min="0"
                                    max={i.quantidade}
                                    step="any"
                                    value={est.separado ? est.quantidadeSeparada : "0"}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      const num = Number(val.replace(",", "."));
                                      atualizarItemSeparacao(i, {
                                        separado: num > 0,
                                        quantidadeSeparada: val,
                                      });
                                    }}
                                    className="h-9 w-20 rounded-lg border border-slate-300 bg-white px-2 text-right text-sm font-semibold tabular-nums dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                  />
                                  <span>{un}</span>
                                </label>
                              </div>
                            ) : (
                              <div className="text-right text-xs">
                                {qtdSepNum > 0 ? (
                                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-medium text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
                                    Separado: {fmt(qtdSepNum)} {un}
                                  </span>
                                ) : (
                                  <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                    Ainda não separado
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Detalhe de item faltante para envio (quando quantidade separada < solicitada) */}
                          {qtdFaltante > 0 && (
                            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs dark:border-amber-900/50 dark:bg-amber-950/30">
                              <span className="font-medium text-amber-900 dark:text-amber-200">
                                Faltando para envio: <strong>{fmt(qtdFaltante)} {un}</strong>
                              </span>

                              {permiteDarBaixa ? (
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-slate-700 dark:text-slate-300">Situação do faltante:</span>
                                  <select
                                    aria-label={`Situação do item faltante ${i.produto?.nome ?? ""}`}
                                    value={est.situacaoFaltante}
                                    onChange={(e) =>
                                      atualizarItemSeparacao(i, {
                                        situacaoFaltante: e.target.value as SituacaoFaltanteSaida,
                                      })
                                    }
                                    className="h-8 rounded-md border border-amber-300 bg-white px-2.5 text-xs font-medium text-slate-900 dark:border-amber-800 dark:bg-slate-900 dark:text-slate-100"
                                  >
                                    <option value="NECESSITA_COMPRA">Necessária a compra</option>
                                    <option value="A_CAMINHO">Já está a caminho (OC emitida)</option>
                                  </select>
                                </div>
                              ) : (
                                <span
                                  className={`rounded-full px-2.5 py-0.5 font-semibold ${
                                    est.situacaoFaltante === "A_CAMINHO"
                                      ? "bg-indigo-100 text-indigo-900 dark:bg-indigo-950/80 dark:text-indigo-300"
                                      : "bg-amber-200/80 text-amber-950 dark:bg-amber-900/60 dark:text-amber-200"
                                  }`}
                                >
                                  {est.situacaoFaltante === "A_CAMINHO"
                                    ? "Item faltante: Já está a caminho"
                                    : "Item faltante: Necessária a compra"}
                                </span>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>

                  {/* Rodapé de ações da separação */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/60 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/50">
                    {permiteDarBaixa ? (
                      <>
                        <button
                          type="button"
                          disabled={cancelarPendente.isPending}
                          onClick={() => cancelarPendente.mutate(s.id)}
                          className="h-9 rounded-lg border border-red-200 px-3 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/50"
                        >
                          Cancelar solicitação
                        </button>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={salvarSeparacao.isPending}
                            onClick={() => salvarSeparacao.mutate(s)}
                            className="h-9 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                          >
                            {salvarSeparacao.isPending && salvarSeparacao.variables?.id === s.id
                              ? "Salvando..."
                              : "Salvar conferência de separação"}
                          </button>
                          <button
                            type="button"
                            disabled={baixar.isPending}
                            onClick={() => baixar.mutate(s)}
                            className="h-9 rounded-lg bg-emerald-700 px-4 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                          >
                            {baixar.isPending && baixar.variables?.id === s.id
                              ? "Dando baixa..."
                              : "Dar baixa nos itens separados"}
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Aguardando o <strong>Almoxarifado</strong> ou <strong>Supervisor</strong> finalizar a separação e
                        dar baixa no estoque.
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

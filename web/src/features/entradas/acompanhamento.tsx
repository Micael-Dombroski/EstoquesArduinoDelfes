"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Paginacao } from "@/components/paginacao";
import { api } from "@/lib/api";
import { podeReceberCompra, podeRevisarCompra, podeSolicitarCompra, useSessao } from "@/lib/auth";
import { mensagemDeErro } from "@/lib/errors";
import { codigoOc, dataLocal, fmt, fmtDataHora, fmtMoeda } from "@/lib/format";
import { useRequisitantes } from "@/lib/hooks";
import { STATUS, prazo, type FiltrosEntradas, type ItemPedidoEntradaAcomp, type PedidoEntradaAcomp, type StatusEntrada } from "./tipos";
import { useAcompanhamentoEntradas } from "./use-entradas";

const TAMANHOS = [10, 20, 50, 100];
const VAZIO: FiltrosEntradas = {
  pedidoDe: "",
  pedidoAte: "",
  entregaDe: "",
  entregaAte: "",
  status: "",
  solicitanteId: "",
  atrasados: "",
};
const MAX_ITENS_RECOLHIDO = 4;

const ATALHOS_STATUS: Array<{ valor: string; rotulo: string }> = [
  { valor: "", rotulo: "Todos" },
  { valor: "pendente", rotulo: "Aguardando revisão" },
  { valor: "a_caminho", rotulo: "OC emitida / A caminho" },
  { valor: "recebido", rotulo: "Recebidos" },
  { valor: "cancelado", rotulo: "Cancelados" },
];

const campo =
  "h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-blue-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus-visible:outline-blue-400";

function validarPeriodo(rotulo: string, de: string, ate: string, permiteFuturo: boolean): string | null {
  if (!de && !ate) return null;
  if (!de || !ate) return `Informe as duas datas do período ${rotulo}.`;
  const d1 = new Date(`${de}T00:00:00`);
  const d2 = new Date(`${ate}T00:00:00`);
  if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) return `Data inválida no período ${rotulo}.`;
  if (d1 > d2) return `No período ${rotulo}, a data inicial não pode ser depois da final.`;
  if (!permiteFuturo && d2 > new Date(`${dataLocal()}T00:00:00`)) return `O período ${rotulo} não pode ter datas no futuro.`;
  const limite = new Date(d1);
  limite.setFullYear(limite.getFullYear() + 1);
  if (d2 > limite) return `O período ${rotulo} não pode ser maior que 1 ano.`;
  return null;
}

function validar(f: FiltrosEntradas): string | null {
  return (
    validarPeriodo("do pedido", f.pedidoDe, f.pedidoAte, false) ??
    validarPeriodo("da previsão de entrega", f.entregaDe, f.entregaAte, true)
  );
}

function valorTotalPedido(itens: ItemPedidoEntradaAcomp[]): number {
  let soma = 0;
  for (const i of itens) {
    const qtd = Number(i.quantidade);
    const preco = Number(i.precoUnitario ?? 0);
    if (Number.isFinite(qtd) && Number.isFinite(preco)) {
      soma += qtd * preco;
    }
  }
  return soma;
}

function Periodo(props: {
  legenda: string;
  idBase: string;
  de: string;
  ate: string;
  max?: string;
  onDe: (v: string) => void;
  onAte: (v: string) => void;
}) {
  return (
    <fieldset className="flex flex-col justify-end">
      <legend className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">{props.legenda}</legend>
      <div className="grid grid-cols-2 gap-2">
        <input
          id={`${props.idBase}-de`}
          aria-label={`${props.legenda}: data inicial`}
          type="date"
          max={props.max}
          value={props.de}
          onChange={(e) => props.onDe(e.target.value)}
          className={campo}
        />
        <input
          id={`${props.idBase}-ate`}
          aria-label={`${props.legenda}: data final`}
          type="date"
          max={props.max}
          value={props.ate}
          onChange={(e) => props.onAte(e.target.value)}
          className={campo}
        />
      </div>
    </fieldset>
  );
}

export function Acompanhamento() {
  const qc = useQueryClient();
  const router = useRouter();
  const { usuario } = useSessao();
  const { data: requisitantes = [] } = useRequisitantes();

  const [hoje] = useState(() => (typeof window !== "undefined" ? dataLocal() : ""));
  const [form, setForm] = useState<FiltrosEntradas>(VAZIO);
  const [aplicados, setAplicados] = useState<FiltrosEntradas>(VAZIO);
  const [mostrarFiltrosAvancados, setMostrarFiltrosAvancados] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [limite, setLimite] = useState(10);

  // Estado de edição e emissão de OC por card
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [expandidos, setExpandidos] = useState<Record<number, boolean>>({});
  const [qtdEditada, setQtdEditada] = useState<Record<number, string>>({});
  const [precoEditado, setPrecoEditado] = useState<Record<number, string>>({});
  const [ocCustomizada, setOcCustomizada] = useState<Record<number, string>>({});

  const { data, isLoading, isFetching, isError, error, refetch } = useAcompanhamentoEntradas(aplicados, pagina, limite);

  useEffect(() => {
    if (isError) toast.error(mensagemDeErro(error), { id: "entradas-erro" });
  }, [isError, error]);

  const pedidos = data?.itens ?? [];
  const total = data?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / limite));
  const paginaEfetiva = data ? Math.min(pagina, totalPaginas) : pagina;

  const podeRevisar = podeRevisarCompra(usuario?.perfil);
  const podeSolicitar = podeSolicitarCompra(usuario?.perfil);
  const podeReceber = podeReceberCompra(usuario?.perfil);

  const salvarItens = useMutation({
    mutationFn: (p: PedidoEntradaAcomp) =>
      api(`/pedidos-entrada/${p.id}/itens`, {
        method: "PUT",
        body: JSON.stringify({
          itens: p.itens.map((i) => ({
            produtoId: i.produtoId,
            quantidade: qtdEditada[i.id] ?? i.quantidade,
            precoUnitario: (precoEditado[i.id] ?? i.precoUnitario ?? "").trim() || null,
            marca: i.marca,
          })),
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries();
      setEditandoId(null);
      toast.success("Itens da solicitação atualizados com sucesso.");
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const aprovar = useMutation({
    mutationFn: ({ id, numeroOc }: { id: number; numeroOc?: string }) =>
      api<PedidoEntradaAcomp>(`/pedidos-entrada/${id}/enviar`, {
        method: "POST",
        body: JSON.stringify(numeroOc?.trim() ? { numeroOc: numeroOc.trim() } : {}),
      }),
    onSuccess: (pedidoAprovado) => {
      qc.invalidateQueries();
      toast.success(`Solicitação aprovada! Ordem de Compra ${codigoOc(pedidoAprovado)} gerada.`);
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  const cancelar = useMutation({
    mutationFn: (id: number) => api(`/pedidos-entrada/${id}/cancelar`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Solicitação/pedido cancelado.");
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  function iniciarEdicao(p: PedidoEntradaAcomp) {
    const q: Record<number, string> = {};
    const pr: Record<number, string> = {};
    for (const i of p.itens) {
      q[i.id] = i.quantidade;
      pr[i.id] = i.precoUnitario ?? "";
    }
    setQtdEditada(q);
    setPrecoEditado(pr);
    setEditandoId(p.id);
  }

  function selecionarStatusRapido(novoStatus: string) {
    const proximo = { ...aplicados, status: novoStatus };
    setForm((f) => ({ ...f, status: novoStatus }));
    setAplicados(proximo);
    setPagina(1);
  }

  function alternarAtrasadosRapido() {
    const novoValor = aplicados.atrasados === "true" ? "" : "true";
    const proximo = { ...aplicados, atrasados: novoValor };
    setForm((f) => ({ ...f, atrasados: novoValor }));
    setAplicados(proximo);
    setPagina(1);
  }

  function filtrar(e: React.FormEvent) {
    e.preventDefault();
    const erro = validar(form);
    if (erro) {
      toast.error(erro, { id: "entradas-filtro" });
      return;
    }
    setPagina(1);
    setAplicados(form);
  }

  function limpar() {
    setForm(VAZIO);
    setPagina(1);
    setAplicados(VAZIO);
  }

  const qtdFiltrosAvancadosAtivos =
    (aplicados.pedidoDe ? 1 : 0) +
    (aplicados.entregaDe ? 1 : 0) +
    (aplicados.solicitanteId ? 1 : 0) +
    (aplicados.atrasados === "true" ? 1 : 0);

  return (
    <section aria-label="Acompanhamento e gestão de pedidos" className="space-y-4">
      {/* Barra superior: Atalhos rápidos de status + botões de filtro avançado e atualizar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Filtrar por status">
          {ATALHOS_STATUS.map((aba) => {
            const ativo = aplicados.status === aba.valor;
            return (
              <button
                key={aba.valor || "todos"}
                type="button"
                role="tab"
                aria-selected={ativo}
                onClick={() => selecionarStatusRapido(aba.valor)}
                className={`h-10 rounded-lg px-3.5 text-sm font-medium transition-colors ${
                  ativo
                    ? "bg-blue-700 text-white dark:bg-blue-600"
                    : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                {aba.rotulo}
              </button>
            );
          })}

          <button
            type="button"
            aria-pressed={aplicados.atrasados === "true"}
            onClick={alternarAtrasadosRapido}
            className={`h-10 rounded-lg px-3.5 text-sm font-medium transition-colors ${
              aplicados.atrasados === "true"
                ? "bg-red-700 text-white hover:bg-red-800 dark:bg-red-600 dark:hover:bg-red-500"
                : "border border-red-300 bg-red-50/60 text-red-800 hover:bg-red-100 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/60"
            }`}
          >
            Em atraso
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMostrarFiltrosAvancados((v) => !v)}
            aria-expanded={mostrarFiltrosAvancados}
            className={`flex h-10 items-center gap-2 rounded-lg border px-3.5 text-sm font-medium transition-colors ${
              mostrarFiltrosAvancados || qtdFiltrosAvancadosAtivos > 0
                ? "border-blue-600 bg-blue-50 text-blue-800 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-300"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            }`}
          >
            <span>Filtros avançados</span>
            {qtdFiltrosAvancadosAtivos > 0 && (
              <span className="rounded-full bg-blue-700 px-1.5 py-0.2 text-xs font-semibold text-white dark:bg-blue-500">
                {qtdFiltrosAvancadosAtivos}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-10 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            {isFetching ? "Atualizando..." : "Atualizar"}
          </button>
        </div>
      </div>

      {/* Painel recolhível de filtros por período, status específico, solicitante e atraso */}
      {mostrarFiltrosAvancados && (
        <form
          onSubmit={filtrar}
          className="grid items-end gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-2"
        >
          <Periodo
            legenda="Pedido feito entre"
            idBase="f-pedido"
            de={form.pedidoDe}
            ate={form.pedidoAte}
            max={hoje || undefined}
            onDe={(v) => setForm((f) => ({ ...f, pedidoDe: v }))}
            onAte={(v) => setForm((f) => ({ ...f, pedidoAte: v }))}
          />
          <Periodo
            legenda="Entrega prevista ou realizada entre"
            idBase="f-entrega"
            de={form.entregaDe}
            ate={form.entregaAte}
            onDe={(v) => setForm((f) => ({ ...f, entregaDe: v }))}
            onAte={(v) => setForm((f) => ({ ...f, entregaAte: v }))}
          />
          <div className="flex flex-col justify-end">
            <label htmlFor="f-status" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Status detalhado
            </label>
            <select
              id="f-status"
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              className={campo}
            >
              <option value="">Todos os status</option>
              {(Object.keys(STATUS) as StatusEntrada[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS[s].rotulo}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col justify-end">
            <label
              htmlFor="f-solicitante"
              className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Solicitante
            </label>
            <select
              id="f-solicitante"
              value={form.solicitanteId}
              onChange={(e) => setForm((f) => ({ ...f, solicitanteId: e.target.value }))}
              className={campo}
            >
              <option value="">Todos os solicitantes</option>
              {requisitantes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-3 dark:border-slate-800 sm:col-span-2">
            <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={form.atrasados === "true"}
                onChange={(e) => setForm((f) => ({ ...f, atrasados: e.target.checked ? "true" : "" }))}
                className="size-4 accent-red-600"
              />
              Mostrar apenas pedidos com entrega em atraso
            </label>

            <div className="flex gap-2">
              <button
                type="submit"
                className="h-10 rounded-lg bg-blue-700 px-4 text-sm font-medium text-white hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                Aplicar filtros
              </button>
              <button
                type="button"
                onClick={limpar}
                className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                Limpar tudo
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Lista de cards unificados */}
      {isLoading ? (
        <div className="h-48 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
      ) : isError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          Não foi possível carregar os pedidos. Use “Atualizar” para tentar de novo.
        </p>
      ) : pedidos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-600 dark:border-slate-700 dark:text-slate-400">
          Nenhum pedido ou solicitação encontrado com esses filtros.
        </p>
      ) : (
        <div className={`space-y-4 ${isFetching ? "opacity-60 transition-opacity" : ""}`}>
          {pedidos.map((p) => {
            const st = STATUS[p.status] ?? STATUS.pendente;
            const pz = prazo(p);
            const emEdicao = editandoId === p.id;
            const expandido = !!expandidos[p.id] || emEdicao;
            const visiveis = expandido ? p.itens : p.itens.slice(0, MAX_ITENS_RECOLHIDO);
            const ocultos = p.itens.length - visiveis.length;

            const valorEstimado = valorTotalPedido(p.itens);
            const minimo = Number(p.fornecedor?.valorMinimoPedido ?? 0);
            const abaixoDoMinimo = minimo > 0 && valorEstimado > 0 && valorEstimado < minimo;
            const pendentesNf = p.recebimentosPendentesNf ?? 0;

            return (
              <article
                key={p.id}
                className="rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900"
              >
                {/* Cabeçalho do pedido */}
                <header className="flex flex-col justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-800 sm:flex-row sm:items-start">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-slate-900 dark:text-slate-100">
                        {p.status === "pendente" ? `Solicitação #${p.id}` : `${codigoOc(p)} · Pedido #${p.id}`}
                        <span className="font-normal text-slate-600 dark:text-slate-400">
                          {" "}
                          · {p.fornecedor?.nome ?? "Sem fornecedor"}
                        </span>
                      </h2>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${st.classe}`}>
                        {p.statusBanco === "RECEBIDO_PARCIAL" ? "OC emitida · Recebido parcial" : st.rotulo}
                      </span>
                      {pendentesNf > 0 && (
                        <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-950/80 dark:text-blue-300">
                          {pendentesNf === 1 ? "1 entrega aguardando NF" : `${pendentesNf} entregas aguardando NF`}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Solicitante: <span className="font-medium text-slate-700 dark:text-slate-300">{p.solicitante?.nome ?? "Almoxarifado"}</span>
                      {" · "}Criado em {fmtDataHora(p.dataPedido)}
                      {p.observacao ? ` · ${p.observacao}` : ""}
                    </p>

                    {pz && (
                      <p
                        className={`text-xs font-medium ${
                          pz.atrasado ? "text-red-700 dark:text-red-400" : "text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        {pz.texto}
                      </p>
                    )}
                  </div>

                  {(valorEstimado > 0 || minimo > 0) && (
                    <div className="shrink-0 text-sm sm:text-right">
                      {valorEstimado > 0 && (
                        <p className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                          {fmtMoeda(valorEstimado)}
                        </p>
                      )}
                      {minimo > 0 && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Mínimo do fornecedor: {fmtMoeda(minimo)}
                        </p>
                      )}
                    </div>
                  )}
                </header>

                {/* Alerta de valor mínimo do fornecedor */}
                {abaixoDoMinimo && p.status === "pendente" && (
                  <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                    Atenção: o valor estimado ({fmtMoeda(valorEstimado)}) está abaixo do pedido mínimo exigido pelo
                    fornecedor ({fmtMoeda(minimo)}).
                  </div>
                )}

                {/* Lista de itens */}
                <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                  {visiveis.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-900 dark:text-slate-100">{i.nome}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {i.codigo ? `Código: ${i.codigo}` : `ID #${i.produtoId}`}
                          {i.marca ? ` · Marca: ${i.marca}` : ""}
                          {Number(i.quantidadeRecebida) > 0 &&
                            ` · Recebido no estoque: ${fmt(i.quantidadeRecebida)} ${i.unidade}`}
                        </p>
                      </div>

                      {emEdicao ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                            Qtd ({i.unidade})
                            <input
                              inputMode="decimal"
                              value={qtdEditada[i.id] ?? i.quantidade}
                              onChange={(e) => setQtdEditada((q) => ({ ...q, [i.id]: e.target.value }))}
                              className="h-9 w-24 rounded-lg border border-slate-300 bg-white px-2 text-right text-sm tabular-nums dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                            />
                          </label>
                          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                            R$ unit.
                            <input
                              inputMode="decimal"
                              placeholder="0,00"
                              value={precoEditado[i.id] ?? i.precoUnitario ?? ""}
                              onChange={(e) => setPrecoEditado((pr) => ({ ...pr, [i.id]: e.target.value }))}
                              className="h-9 w-24 rounded-lg border border-slate-300 bg-white px-2 text-right text-sm tabular-nums dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                            />
                          </label>
                        </div>
                      ) : (
                        <div className="text-right tabular-nums">
                          <p className="font-medium text-slate-900 dark:text-slate-100">
                            {fmt(i.quantidade)} {i.unidade}
                          </p>
                          {i.precoUnitario && (
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {fmtMoeda(Number(i.precoUnitario))} / {i.unidade}
                            </p>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>

                {/* Botão para expandir/recolher quando há muitos itens */}
                {!emEdicao && p.itens.length > MAX_ITENS_RECOLHIDO && (
                  <div className="border-t border-slate-100 px-4 py-2 dark:border-slate-800/60">
                    <button
                      type="button"
                      onClick={() => setExpandidos((e) => ({ ...e, [p.id]: !expandido }))}
                      className="text-xs font-medium text-blue-700 hover:underline dark:text-blue-400"
                    >
                      {expandido
                        ? "Mostrar menos itens"
                        : `Ver mais ${ocultos} ${ocultos === 1 ? "item" : "itens"} deste pedido`}
                    </button>
                  </div>
                )}

                {/* Rodapé de ações para solicitações pendentes (RASCUNHO) */}
                {p.status === "pendente" && (podeSolicitar || podeRevisar) && (
                  <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/60 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/50">
                    <div className="flex flex-wrap gap-2">
                      {emEdicao ? (
                        <>
                          <button
                            type="button"
                            disabled={salvarItens.isPending}
                            onClick={() => salvarItens.mutate(p)}
                            className="h-9 rounded-lg bg-blue-700 px-3.5 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
                          >
                            Salvar revisão
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditandoId(null)}
                            className="h-9 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                          >
                            Cancelar
                          </button>
                        </>
                      ) : (
                        podeSolicitar && (
                          <button
                            type="button"
                            onClick={() => iniciarEdicao(p)}
                            className="h-9 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                          >
                            Revisar quantidades / preços
                          </button>
                        )
                      )}
                    </div>

                    {podeRevisar ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          placeholder={`${codigoOc(p)} (opcional)`}
                          aria-label={`Número da OC para solicitação #${p.id}`}
                          value={ocCustomizada[p.id] ?? ""}
                          onChange={(e) => setOcCustomizada((prev) => ({ ...prev, [p.id]: e.target.value }))}
                          className="h-9 w-36 rounded-lg border border-slate-300 bg-white px-2.5 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        />
                        <button
                          type="button"
                          disabled={aprovar.isPending}
                          onClick={() => aprovar.mutate({ id: p.id, numeroOc: ocCustomizada[p.id] })}
                          className="h-9 rounded-lg bg-emerald-700 px-3.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                        >
                          Aprovar e gerar OC
                        </button>
                        <button
                          type="button"
                          disabled={cancelar.isPending}
                          onClick={() => cancelar.mutate(p.id)}
                          className="h-9 rounded-lg border border-red-200 px-3 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/50"
                        >
                          Rejeitar
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Aguardando o <strong>Setor de Compras</strong> ou <strong>Supervisor</strong> revisar e emitir a
                        OC.
                      </p>
                    )}
                  </footer>
                )}

                {/* Rodapé de ações rápidas para OCs a caminho */}
                {p.status === "a_caminho" && (podeReceber || podeRevisar) && (
                  <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/60 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/50">
                    <span className="text-xs text-slate-600 dark:text-slate-400">
                      Ordem de Compra <strong>{codigoOc(p)}</strong> ativa para conferência física e lançamento de NF.
                    </span>
                    <button
                      type="button"
                      onClick={() => router.push(`/recebimento?pedidoId=${p.id}`)}
                      className="h-9 rounded-lg bg-blue-700 px-3.5 text-xs font-medium text-white hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500"
                    >
                      Ir para Recebimento (OC / NF)
                    </button>
                  </footer>
                )}
              </article>
            );
          })}
        </div>
      )}

      {total > 0 && (
        <Paginacao
          pagina={paginaEfetiva}
          limite={limite}
          total={total}
          tamanhos={TAMANHOS}
          ocupado={isFetching}
          rotulo="pedidos"
          onPagina={setPagina}
          onLimite={(l) => {
            setLimite(l);
            setPagina(1);
          }}
        />
      )}
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Paginacao } from "@/components/paginacao";
import { mensagemDeErro } from "@/lib/errors";
import { dataLocal, fmt, fmtDataHora } from "@/lib/format";
import { useRequisitantes } from "@/lib/hooks";
import { STATUS, prazo, type FiltrosEntradas, type StatusEntrada } from "./tipos";
import { useAcompanhamentoEntradas } from "./use-entradas";

const TAMANHOS = [10, 20, 50, 100];
const VAZIO: FiltrosEntradas = { pedidoDe: "", pedidoAte: "", entregaDe: "", entregaAte: "", status: "", solicitanteId: "" };
const MAX_ITENS_VISIVEIS = 3;

const campo =
  "h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-blue-700";

// Período opcional: nenhuma data, ou as duas; início <= fim; no máximo 1 ano.
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
    <fieldset>
      <legend className="mb-1 text-sm font-medium">{props.legenda}</legend>
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
  const { data: requisitantes = [] } = useRequisitantes();

  const [hoje, setHoje] = useState("");
  const [form, setForm] = useState<FiltrosEntradas>(VAZIO);
  const [aplicados, setAplicados] = useState<FiltrosEntradas | null>(VAZIO);
  const [pagina, setPagina] = useState(1);
  const [limite, setLimite] = useState(10);

  // Data de hoje só no cliente (limite do campo "pedido feito"), sem diferença de fuso na hidratação.
  useEffect(() => setHoje(dataLocal()), []);

  const { data, isLoading, isFetching, isError, error, refetch } = useAcompanhamentoEntradas(aplicados, pagina, limite);

  useEffect(() => {
    if (isError) toast.error(mensagemDeErro(error), { id: "entradas-erro" });
  }, [isError, error]);

  const pedidos = data?.itens ?? [];
  const total = data?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / limite));

  useEffect(() => {
    if (data && pagina > totalPaginas) setPagina(totalPaginas);
  }, [data, pagina, totalPaginas]);

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

  return (
    <section aria-label="Acompanhamento de pedidos" className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isFetching ? "Atualizando..." : "Atualizar lista"}
        </button>
      </div>

      <form onSubmit={filtrar} className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2">
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
        <div>
          <label htmlFor="f-status" className="mb-1 block text-sm font-medium">
            Status
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
        <div>
          <label htmlFor="f-solicitante" className="mb-1 block text-sm font-medium">
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
        <div className="flex gap-2 sm:col-span-2">
          <button type="submit" className="h-11 rounded-lg bg-blue-700 px-5 text-sm font-medium text-white hover:bg-blue-800">
            Filtrar
          </button>
          <button
            type="button"
            onClick={limpar}
            className="h-11 rounded-lg border border-slate-300 bg-white px-5 text-sm font-medium hover:bg-slate-100"
          >
            Limpar filtros
          </button>
        </div>
      </form>

      {isLoading ? (
        <div className="h-48 animate-pulse rounded-lg bg-slate-200" />
      ) : isError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          Não foi possível carregar os pedidos. Use “Atualizar lista” para tentar de novo.
        </p>
      ) : pedidos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-600">
          Nenhum pedido encontrado com esses filtros. Ajuste a busca para ampliar o resultado.
        </p>
      ) : (
        <ul
          className={`divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white ${isFetching ? "opacity-60" : ""}`}
        >
          {pedidos.map((p) => {
            const st = STATUS[p.status] ?? STATUS.pendente;
            const pz = prazo(p);
            const visiveis = p.itens.slice(0, MAX_ITENS_VISIVEIS);
            const restantes = p.itens.length - visiveis.length;
            return (
              <li key={p.id} className="space-y-2 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      Pedido #{p.id} <span className="font-normal text-slate-600">· {p.fornecedor.nome}</span>
                    </p>
                    <p className="text-sm text-slate-600">
                      Solicitante: {p.solicitante?.nome ?? "Não informado"} · Feito em {fmtDataHora(p.dataPedido)}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${st.classe}`}>{st.rotulo}</span>
                </div>

                {pz && (
                  <p className={`text-sm font-medium ${pz.atrasado ? "text-red-700" : "text-slate-800"}`}>{pz.texto}</p>
                )}

                <ul className="space-y-0.5 text-sm text-slate-700">
                  {visiveis.map((i) => (
                    <li key={i.id} className="flex justify-between gap-4">
                      <span>{i.nome}</span>
                      <span className="whitespace-nowrap tabular-nums">
                        {fmt(i.quantidade)} {i.unidade}
                        {p.status === "a_caminho" && Number(i.quantidadeRecebida) > 0 && (
                          <span className="text-slate-500"> (recebido {fmt(i.quantidadeRecebida)})</span>
                        )}
                      </span>
                    </li>
                  ))}
                  {restantes > 0 && (
                    <li className="text-slate-500">e mais {restantes} {restantes === 1 ? "item" : "itens"}</li>
                  )}
                </ul>

                {p.observacao && <p className="text-sm text-slate-600">{p.observacao}</p>}
              </li>
            );
          })}
        </ul>
      )}

      {total > 0 && (
        <Paginacao
          pagina={pagina}
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

"use client";

import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { mensagemDeErro } from "@/lib/errors";
import { mascaraCnpj, mascaraTelefone } from "./cnpj";
import {
  filtrarFornecedores,
  montarCorpoEdicao,
  rascunhoDe,
  useAlterarAtivo,
  useAtualizarFornecedor,
  useFornecedores,
  validarEdicao,
  type FornecedorApi,
  type Ordem,
  type Rascunho,
} from "./gestao";
import type { Erros } from "./form";

const campo =
  "h-11 w-full rounded-lg border bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-blue-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus-visible:outline-blue-400";
const bordaOk = "border-slate-300 dark:border-slate-700";
const bordaErro = "border-red-500 dark:border-red-500";
const cartao = "rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900";
const botaoBase =
  "h-10 rounded-lg border px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-blue-700 dark:focus-visible:outline-blue-400";
const botaoNeutro = `${botaoBase} border-slate-300 bg-white hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800`;
// true = perfil só consulta (sem lápis, sem salvar, sem ativar/desativar)
const LeituraCtx = createContext(false);

function IconeLapis() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-4">
      <path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" />
      <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5Z" />
    </svg>
  );
}

function IconeSeta({ aberto }: { aberto: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`size-5 shrink-0 transition-transform ${aberto ? "rotate-180" : ""}`}
    >
      <path
        fillRule="evenodd"
        d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// Mostra o valor com um lápis ao lado; ao clicar, vira um campo editável.
function CampoEditavel(props: {
  id: string;
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  erro?: string;
  mascara?: (v: string) => string;
  exibir?: (v: string) => string;
  inputMode?: "text" | "numeric" | "decimal" | "tel";
  type?: string;
  placeholder?: string;
  maxLength?: number;
  grande?: boolean;
}) {
  const leitura = useContext(LeituraCtx);
  const [editando, setEditando] = useState(false);
  const aberto = !leitura && (editando || !!props.erro);

  return (
    <div>
      <p className="mb-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">{props.rotulo}</p>
      {aberto ? (
        <input
          id={props.id}
          aria-label={props.rotulo}
          aria-invalid={props.erro ? true : undefined}
          aria-describedby={props.erro ? `${props.id}-erro` : undefined}
          autoFocus
          autoComplete="off"
          type={props.type}
          inputMode={props.inputMode}
          placeholder={props.placeholder}
          maxLength={props.maxLength}
          value={props.valor}
          onChange={(e) => props.onChange(props.mascara ? props.mascara(e.target.value) : e.target.value)}
          onBlur={() => setEditando(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
          className={`${campo} ${props.erro ? bordaErro : bordaOk}`}
        />
      ) : (
        <div className="flex min-h-11 items-center justify-between gap-2">
          <span className={`min-w-0 break-words ${props.grande ? "text-lg font-semibold" : "text-sm"}`}>
            {props.valor ? (
              props.exibir ? props.exibir(props.valor) : props.valor
            ) : (
              <span className="text-slate-400 dark:text-slate-500">Não informado</span>
            )}
          </span>
                    {!leitura && (
            <button
              type="button"
              onClick={() => setEditando(true)}
              aria-label={`Editar ${props.rotulo}`}
              className="shrink-0 rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-blue-400 dark:focus-visible:outline-blue-400"
            >
              <IconeLapis />
            </button>
          )}
        </div>
      )}
      {props.erro && (
        <p id={`${props.id}-erro`} role="alert" className="mt-1 text-sm text-red-700 dark:text-red-400">
          {props.erro}
        </p>
      )}
    </div>
  );
}

const ITENS_VISIVEIS = 5;

// Lista que mostra no máximo 5 itens; os demais ficam num scroll vertical interno.
// A altura é medida nos itens reais, então vale para celular, desktop e itens com mensagem de erro.
function ListaRolavel({ total, children }: { total: number; children: React.ReactNode }) {
  const ref = useRef<HTMLUListElement>(null);
  const [altura, setAltura] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    const ul = ref.current;
    if (!ul) return;

    const medir = () => {
      const itens = Array.from(ul.children) as HTMLElement[];
      if (itens.length <= ITENS_VISIVEIS) {
        setAltura(undefined);
        return;
      }
      const primeiro = itens[0];
      const ultimoVisivel = itens[ITENS_VISIVEIS - 1];
      setAltura(ultimoVisivel.offsetTop + ultimoVisivel.offsetHeight - primeiro.offsetTop);
    };

    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(ul);
    Array.from(ul.children).forEach((li) => ro.observe(li));
    return () => ro.disconnect();
  }, [total]);

  const rola = altura !== undefined;

  return (
    <>
      <ul
        ref={ref}
        tabIndex={rola ? 0 : undefined}
        aria-label={rola ? `Produtos do fornecedor (${total}); role para ver todos` : undefined}
        style={rola ? { maxHeight: altura } : undefined}
        className={`relative space-y-3 ${
          rola
            ? "overflow-y-auto overscroll-contain pr-2 focus-visible:outline-2 focus-visible:outline-blue-700 dark:focus-visible:outline-blue-400"
            : ""
        }`}
      >
        {children}
      </ul>
      {rola && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Mostrando {ITENS_VISIVEIS} de {total} produtos. Role a lista para ver os demais.
        </p>
      )}
    </>
  );
}

function CartaoFornecedor({ f }: { f: FornecedorApi }) {
  const leitura = useContext(LeituraCtx);
  const qc = useQueryClient();
  const original = useMemo(() => rascunhoDe(f), [f]);
  const [r, setR] = useState<Rascunho>(original);
  const [erros, setErros] = useState<Erros>({});
  const [confirmando, setConfirmando] = useState(false);
  const atualizar = useAtualizarFornecedor(f.id);
  const alterarAtivo = useAlterarAtivo(f.id);

  const id = (k: string) => `f${f.id}-${k}`;
  const sujo = JSON.stringify(r) !== JSON.stringify(original);
  const ocupado = atualizar.isPending || alterarAtivo.isPending;
    const [produtosAbertos, setProdutosAbertos] = useState(false);
  // Se houver erro de validação em algum produto, abre a lista para o campo poder ser mostrado e focado.
  const temErroProduto = Object.keys(erros).some((k) => k.startsWith("p"));
  const mostrarProdutos = produtosAbertos || temErroProduto;
  const produtosAlterados = JSON.stringify(r.produtos) !== JSON.stringify(original.produtos);
  const idProdutos = id("produtos");
  const resumoProdutos =
    f.produtos
      .slice(0, 3)
      .map((v) => v.produto.nome)
      .join(", ") + (f.produtos.length > 3 ? ` e mais ${f.produtos.length - 3}` : "");

  function limparErro(chave: string) {
    setErros((e) => {
      if (!(chave in e)) return e;
      const { [chave]: _, ...resto } = e;
      return resto;
    });
  }

  function mudar(parte: Partial<Omit<Rascunho, "produtos">>, chaveErro: string) {
    setR((x) => ({ ...x, ...parte }));
    limparErro(chaveErro);
  }

  function mudarProduto(produtoId: number, parte: Partial<Rascunho["produtos"][number]>, chaveErro?: string) {
    setR((x) => ({ ...x, produtos: x.produtos.map((p) => (p.produtoId === produtoId ? { ...p, ...parte } : p)) }));
    if (chaveErro) limparErro(chaveErro);
  }

  function salvar() {
    const encontrados = validarEdicao(r);
    setErros(encontrados);
    const primeiro = Object.keys(encontrados)[0];
    if (primeiro) {
            if (Object.keys(encontrados).some((k) => k.startsWith("p"))) setProdutosAbertos(true);
      toast.error("Corrija os campos destacados antes de salvar.", { id: `forn-${f.id}` });
      requestAnimationFrame(() => document.getElementById(id(primeiro))?.focus());
      return;
    }
    atualizar.mutate(montarCorpoEdicao(r), {
      onSuccess: () => {
        toast.success(`Fornecedor “${r.nome.trim()}” atualizado.`);
        qc.invalidateQueries(); // a lista recarrega e este cartão volta ao estado "sem alterações"
      },
      onError: (err) => {
        if (err instanceof ApiError && err.code === "CNPJ_DUPLICADO") setErros({ cnpj: mensagemDeErro(err) });
        toast.error(mensagemDeErro(err), { id: `forn-${f.id}` });
      },
    });
  }

  function trocarAtivo(ativo: boolean) {
    alterarAtivo.mutate(ativo, {
      onSuccess: () => {
        toast.success(`Fornecedor “${f.nome}” ${ativo ? "ativado" : "desativado"}.`);
        qc.invalidateQueries();
      },
      onError: (err) => toast.error(mensagemDeErro(err), { id: `forn-${f.id}` }),
    });
  }

  return (
    <article className={`${cartao} space-y-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <CampoEditavel
            id={id("nome")}
            rotulo="Nome ou razão social"
            grande
            maxLength={150}
            valor={r.nome}
            erro={erros["nome"]}
            onChange={(v) => mudar({ nome: v }, "nome")}
          />
        </div>
        <span
          className={`mt-5 shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
            f.ativo
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
              : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
          }`}
        >
          {f.ativo ? "Ativo" : "Desativado"}
        </span>
      </div>

      <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
        <CampoEditavel
          id={id("cnpj")}
          rotulo="CNPJ"
          inputMode="numeric"
          placeholder="00.000.000/0000-00"
          mascara={mascaraCnpj}
          valor={r.cnpj}
          erro={erros["cnpj"]}
          onChange={(v) => mudar({ cnpj: v }, "cnpj")}
        />
        <CampoEditavel
          id={id("minimo")}
          rotulo="Compra mínima (R$)"
          inputMode="decimal"
          placeholder="0,00"
          exibir={(v) => `R$ ${v}`}
          valor={r.valorMinimo}
          erro={erros["minimo"]}
          onChange={(v) => mudar({ valorMinimo: v }, "minimo")}
        />
        <CampoEditavel
          id={id("contato")}
          rotulo="Pessoa de contato"
          maxLength={100}
          valor={r.contato}
          onChange={(v) => mudar({ contato: v }, "contato")}
        />
        <CampoEditavel
          id={id("telefone")}
          rotulo="Telefone"
          inputMode="tel"
          placeholder="(00) 00000-0000"
          mascara={mascaraTelefone}
          valor={r.telefone}
          erro={erros["telefone"]}
          onChange={(v) => mudar({ telefone: v }, "telefone")}
        />
        <div className="sm:col-span-2">
          <CampoEditavel
            id={id("email")}
            rotulo="E-mail"
            type="email"
            maxLength={150}
            valor={r.email}
            erro={erros["email"]}
            onChange={(v) => mudar({ email: v }, "email")}
          />
        </div>
      </div>

            <section aria-label="Produtos fornecidos" className="border-t border-slate-200 pt-2 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setProdutosAbertos((a) => !a)}
          aria-expanded={mostrarProdutos}
          aria-controls={idProdutos}
          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-1 text-left hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-700 dark:hover:bg-slate-800/50 dark:focus-visible:outline-blue-400"
        >
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              Produtos fornecidos ({f.produtos.length})
              {produtosAlterados && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950/80 dark:text-amber-300">
                  alterado
                </span>
              )}
            </span>
            {!mostrarProdutos && f.produtos.length > 0 && (
              <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{resumoProdutos}</span>
            )}
          </span>
          <IconeSeta aberto={mostrarProdutos} />
        </button>

        {mostrarProdutos && (
          <div id={idProdutos} className="mt-3">
            {f.produtos.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Nenhum produto vinculado.</p>
            ) : (
              <ListaRolavel total={f.produtos.length}>
                {f.produtos.map((v) => {
                  const p = r.produtos.find((x) => x.produtoId === v.produtoId);
                  if (!p) return null;
                  const kPrazo = `p${v.produtoId}-prazo`;
                  const kPreco = `p${v.produtoId}-preco`;
                  return (
                    <li key={v.produtoId} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="min-w-0 text-sm">
                          <span className="font-medium">{v.produto.nome}</span>{" "}
                          <span className="text-slate-500 dark:text-slate-400">{v.produto.codigo}</span>
                        </p>
                        <label className="flex min-h-9 items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={p.preferencial}
                            disabled={leitura}
                            onChange={(e) => mudarProduto(v.produtoId, { preferencial: e.target.checked })}
                            className="size-5 disabled:cursor-not-allowed"
                          />
                          Preferencial
                        </label>
                      </div>
                      <div className="grid gap-x-4 sm:grid-cols-2">
                        <CampoEditavel
                          id={id(kPrazo)}
                          rotulo="Prazo de entrega (dias)"
                          inputMode="numeric"
                          exibir={(x) => `${x} ${x === "1" ? "dia" : "dias"}`}
                          valor={p.prazo}
                          erro={erros[kPrazo]}
                          onChange={(x) => mudarProduto(v.produtoId, { prazo: x.replace(/\D/g, "").slice(0, 3) }, kPrazo)}
                        />
                        <CampoEditavel
                          id={id(kPreco)}
                          rotulo={`Preço (R$ por ${v.produto.unidade})`}
                          inputMode="decimal"
                          placeholder="0,00"
                          exibir={(x) => `R$ ${x}`}
                          valor={p.preco}
                          erro={erros[kPreco]}
                          onChange={(x) => mudarProduto(v.produtoId, { preco: x }, kPreco)}
                        />
                      </div>
                    </li>
                  );
                })}
              </ListaRolavel>
            )}
          </div>
        )}
            </section>

      {!leitura && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            {f.ativo ? (
              confirmando ? (
                <>
                  <span className="text-sm">Desativar este fornecedor?</span>
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => trocarAtivo(false)}
                    className={`${botaoBase} border-red-700 bg-red-700 text-white hover:bg-red-800 dark:border-red-600 dark:bg-red-600 dark:hover:bg-red-500`}
                  >
                    {alterarAtivo.isPending ? "Desativando..." : "Confirmar"}
                  </button>
                  <button type="button" disabled={ocupado} onClick={() => setConfirmando(false)} className={botaoNeutro}>
                    Cancelar
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => setConfirmando(true)}
                  className={`${botaoBase} border-red-300 bg-white text-red-700 hover:bg-red-50 dark:border-red-900 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-red-950/40`}
                >
                  Desativar fornecedor
                </button>
              )
            ) : (
              <button
                type="button"
                disabled={ocupado}
                onClick={() => trocarAtivo(true)}
                className={`${botaoBase} border-emerald-600 bg-white text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:bg-slate-900 dark:text-emerald-400 dark:hover:bg-emerald-950/40`}
              >
                {alterarAtivo.isPending ? "Ativando..." : "Ativar fornecedor"}
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {sujo && (
              <>
                <span aria-live="polite" className="text-xs text-amber-700 dark:text-amber-400">
                  Alterações não salvas
                </span>
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => {
                    setR(original);
                    setErros({});
                  }}
                  className={botaoNeutro}
                >
                  Descartar
                </button>
              </>
            )}
            <button
              type="button"
              onClick={salvar}
              disabled={!sujo || ocupado}
              className={`${botaoBase} ${
                sujo
                  ? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 dark:border-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                  : "border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-500"
              }`}
            >
              {atualizar.isPending ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

export function ListaFornecedores({ ativo, somenteLeitura = false }: { ativo: boolean; somenteLeitura?: boolean }) {
  const { data = [], isLoading, isError, error } = useFornecedores(ativo);
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<Ordem>("az");

  const lista = useMemo(() => filtrarFornecedores(data, busca, ordem), [data, busca, ordem]);

  return (
    <LeituraCtx.Provider value={somenteLeitura}>
      <div className="space-y-4">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-60 flex-1">
              <label htmlFor={`busca-${ativo}`} className="sr-only">
                Buscar fornecedor
              </label>
              <input
                id={`busca-${ativo}`}
                type="search"
                autoComplete="off"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome, CNPJ, contato, e-mail, telefone ou produto"
                className={`${campo} ${bordaOk}`}
              />
            </div>
            <div
              role="group"
              aria-label="Ordenar por nome"
              className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800"
            >
              {(["az", "za"] as const).map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setOrdem(o)}
                  aria-pressed={ordem === o}
                  className={`h-9 rounded-md px-4 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-blue-700 dark:focus-visible:outline-blue-400 ${
                    ordem === o
                      ? "bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-slate-100"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  {o === "az" ? "A–Z" : "Z–A"}
                </button>
              ))}
            </div>
          </div>

          {!isLoading && !isError && (
            <p aria-live="polite" className="text-sm text-slate-600 dark:text-slate-400">
              {lista.length} de {data.length} {data.length === 1 ? "fornecedor" : "fornecedores"}
            </p>
          )}

          {isLoading ? (
            <div className="h-40 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
          ) : isError ? (
            <p className="text-red-700 dark:text-red-400">{mensagemDeErro(error)}</p>
          ) : data.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-600 dark:border-slate-700 dark:text-slate-400">
              {ativo ? "Nenhum fornecedor ativo." : "Nenhum fornecedor desativado."}
            </p>
          ) : lista.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-600 dark:border-slate-700 dark:text-slate-400">
              Nenhum fornecedor encontrado para “{busca}”.
            </p>
          ) : (
            <ul className="space-y-4">
              {lista.map((f) => (
                <li key={`${f.id}-${f.atualizadoEm}`}>
                  <CartaoFornecedor f={f} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </LeituraCtx.Provider>
  );
  
}
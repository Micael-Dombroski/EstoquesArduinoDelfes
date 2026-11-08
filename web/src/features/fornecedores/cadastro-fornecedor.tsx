"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { podeCadastrarFornecedor, useSessao } from "@/lib/auth";
import { mensagemDeErro } from "@/lib/errors";
import { fmtMoeda } from "@/lib/format";
import { useProdutos } from "@/lib/hooks";
import { mascaraCnpj, mascaraTelefone } from "./cnpj";
import {
  FORM_VAZIO,
  NOVO_VAZIO,
  montarCorpo,
  normalizaDinheiro,
  novaLinha,
  validar,
  type Erros,
  type FormFornecedor,
  type LinhaProduto,
  type NovoProdutoForm,
} from "./form";
import { SeletorProduto } from "./seletor-produto";

const campo =
  "h-11 w-full rounded-lg border bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-blue-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus-visible:outline-blue-400";
const bordaOk = "border-slate-300 dark:border-slate-700";
const bordaErro = "border-red-500 dark:border-red-500";
const cartao = "rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900";
const botaoSecundario =
  "h-11 rounded-lg border border-slate-300 bg-white px-5 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800";

function Campo(props: {
  id: string;
  rotulo: string;
  obrigatorio?: boolean;
  ajuda?: string;
  erro?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={props.id} className="mb-1 block text-sm font-medium">
        {props.rotulo}
        {props.obrigatorio && <span className="text-red-600 dark:text-red-400"> *</span>}
      </label>
      {props.children}
      {props.erro ? (
        <p id={`${props.id}-erro`} role="alert" className="mt-1 text-sm text-red-700 dark:text-red-400">
          {props.erro}
        </p>
      ) : props.ajuda ? (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{props.ajuda}</p>
      ) : null}
    </div>
  );
}

// Alternador "Produto cadastrado | Produto novo" (mesmo padrão do seletor de tema)
function AlternadorModo({ modo, onChange }: { modo: LinhaProduto["modo"]; onChange: (m: LinhaProduto["modo"]) => void }) {
  const opcoes: { valor: LinhaProduto["modo"]; rotulo: string }[] = [
    { valor: "existente", rotulo: "Produto cadastrado" },
    { valor: "novo", rotulo: "Produto novo" },
  ];
  return (
    <div
      role="group"
      aria-label="Tipo de produto"
      className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 sm:w-80 dark:bg-slate-800"
    >
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          onClick={() => onChange(o.valor)}
          aria-pressed={modo === o.valor}
          className={`h-9 rounded-md text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-blue-700 dark:focus-visible:outline-blue-400 ${
            modo === o.valor
              ? "bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-slate-100"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

function Restrito() {
  return (
    <div
      role="alert"
      className="rounded-lg border border-amber-300 bg-amber-50 p-5 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
    >
      <p className="font-medium">Acesso restrito ao Supervisor</p>
      <p className="mt-1 text-sm">
        Somente o perfil Supervisor pode cadastrar fornecedores. Peça a um supervisor ou troque de perfil em “Trocar
        perfil / Sair”.
      </p>
    </div>
  );
}

export function CadastroFornecedor() {
  const qc = useQueryClient();
  const { usuario } = useSessao();
  const { data: produtos = [], isLoading, isError, error } = useProdutos();

  const [form, setForm] = useState<FormFornecedor>(FORM_VAZIO);
  const [linhas, setLinhas] = useState<LinhaProduto[]>(() => [novaLinha()]);
  const [erros, setErros] = useState<Erros>({});

  const ativos = useMemo(() => produtos.filter((p) => p.ativo), [produtos]);
  const produtoPorId = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);
  // Só linhas em modo "existente" ocupam um produto do catálogo
  const usados = useMemo(
    () => new Set(linhas.flatMap((l) => (l.modo === "existente" && l.produtoId != null ? [l.produtoId] : []))),
    [linhas],
  );

  const salvar = useMutation({
    mutationFn: (corpo: ReturnType<typeof montarCorpo>) =>
      api("/cadastro-fornecedor", { method: "POST", body: JSON.stringify(corpo) }),
  });

  if (!podeCadastrarFornecedor(usuario?.perfil)) return <Restrito />;

  const minimo = normalizaDinheiro(form.valorMinimo);

  // Ao editar um campo, o erro dele some.
  function limparErro(id: string) {
    setErros((e) => {
      if (!(id in e)) return e;
      const { [id]: _, ...resto } = e;
      return resto;
    });
  }

  function campoTexto(id: keyof FormFornecedor, idCampo: string, transforma?: (v: string) => string) {
    return {
      id: idCampo,
      value: form[id],
      "aria-invalid": erros[idCampo] ? true : undefined,
      "aria-describedby": erros[idCampo] ? `${idCampo}-erro` : undefined,
      className: `${campo} ${erros[idCampo] ? bordaErro : bordaOk}`,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = transforma ? transforma(e.target.value) : e.target.value;
        setForm((f) => ({ ...f, [id]: v }));
        limparErro(idCampo);
      },
    };
  }

  function atualizarLinha(chave: string, parte: Partial<LinhaProduto>, campoErro?: string) {
    setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, ...parte } : l)));
    if (campoErro) limparErro(`${chave}-${campoErro}`);
  }

  function atualizarNovo(chave: string, parte: Partial<NovoProdutoForm>, campoErro: string) {
    setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, novo: { ...l.novo, ...parte } } : l)));
    limparErro(`${chave}-${campoErro}`);
  }

  function trocarModo(chave: string, modo: LinhaProduto["modo"], nomeInicial?: string) {
    setLinhas((ls) =>
      ls.map((l) =>
        l.chave === chave
          ? {
              ...l,
              modo,
              produtoId: modo === "novo" ? null : l.produtoId,
              novo: nomeInicial ? { ...l.novo, nome: nomeInicial } : l.novo,
            }
          : l,
      ),
    );
    for (const c of ["produto", "codigo", "nome", "unidade", "ponto"]) limparErro(`${chave}-${c}`);
  }

  function removerLinha(chave: string) {
    setLinhas((ls) => ls.filter((l) => l.chave !== chave));
  }

  function limparTudo() {
    setForm(FORM_VAZIO);
    setLinhas([novaLinha()]);
    setErros({});
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    const encontrados = validar(form, linhas);
    setErros(encontrados);
    const primeiro = Object.keys(encontrados)[0];
    if (primeiro) {
      toast.error("Corrija os campos destacados antes de cadastrar.", { id: "fornecedor-form" });
      requestAnimationFrame(() => document.getElementById(primeiro)?.focus());
      return;
    }

    const nome = form.nome.trim();
    const qtd = linhas.length;
    const qtdNovos = linhas.filter((l) => l.modo === "novo").length;
    salvar.mutate(montarCorpo(form, linhas), {
      onSuccess: () => {
        const extra =
          qtdNovos > 0 ? ` ${qtdNovos} ${qtdNovos === 1 ? "produto novo foi criado" : "produtos novos foram criados"} com saldo 0.` : "";
        toast.success(`Fornecedor “${nome}” cadastrado com ${qtd} ${qtd === 1 ? "produto" : "produtos"}.${extra}`);
        qc.invalidateQueries(); // a reposição e o catálogo passam a considerar o novo fornecedor/produtos
        limparTudo();
        document.getElementById("f-nome")?.focus();
      },
      onError: (err) => {
        if (err instanceof ApiError && err.code === "CNPJ_DUPLICADO") {
          setErros({ "f-cnpj": mensagemDeErro(err) });
          document.getElementById("f-cnpj")?.focus();
        }
        if (err instanceof ApiError && err.code === "CODIGO_DUPLICADO") {
          // A API devolve { details: [{ codigo }] }; marca as linhas com esses códigos (se o ApiError expuser details)
          const det = (err as unknown as { details?: { codigo?: string }[] }).details ?? [];
          const repetidos = new Set(det.map((d) => d.codigo?.trim().toLowerCase()));
          const novosErros: Erros = {};
          for (const l of linhas) {
            if (l.modo === "novo" && repetidos.has(l.novo.codigo.trim().toLowerCase())) {
              novosErros[`${l.chave}-codigo`] = mensagemDeErro(err);
            }
          }
          if (Object.keys(novosErros).length > 0) setErros(novosErros);
        }
        toast.error(mensagemDeErro(err), { id: "fornecedor-erro" });
      },
    });
  }

  return (
    <form onSubmit={enviar} noValidate className="space-y-6">
      <section aria-labelledby="t-dados" className={`${cartao} space-y-4`}>
        <h2 id="t-dados" className="text-lg font-semibold">
          Dados do fornecedor
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Campo id="f-nome" rotulo="Nome ou razão social" obrigatorio erro={erros["f-nome"]}>
              <input {...campoTexto("nome", "f-nome")} autoFocus autoComplete="off" maxLength={150} />
            </Campo>
          </div>
          <Campo id="f-cnpj" rotulo="CNPJ" erro={erros["f-cnpj"]} ajuda="Opcional. Evita cadastrar o mesmo fornecedor duas vezes.">
            <input {...campoTexto("cnpj", "f-cnpj", mascaraCnpj)} inputMode="numeric" placeholder="00.000.000/0000-00" />
          </Campo>
          <Campo
            id="f-minimo"
            rotulo="Compra mínima (R$)"
            erro={erros["f-minimo"]}
            ajuda="Menor valor de pedido que o fornecedor aceita. Deixe em branco se não houver."
          >
            <input {...campoTexto("valorMinimo", "f-minimo")} inputMode="decimal" placeholder="0,00" />
          </Campo>
          <Campo id="f-contato" rotulo="Pessoa de contato">
            <input {...campoTexto("contato", "f-contato")} autoComplete="off" maxLength={100} />
          </Campo>
          <Campo id="f-telefone" rotulo="Telefone" erro={erros["f-telefone"]}>
            <input {...campoTexto("telefone", "f-telefone", mascaraTelefone)} inputMode="tel" placeholder="(00) 00000-0000" />
          </Campo>
          <div className="sm:col-span-2">
            <Campo id="f-email" rotulo="E-mail" erro={erros["f-email"]}>
              <input {...campoTexto("email", "f-email")} type="email" autoComplete="off" maxLength={150} />
            </Campo>
          </div>
        </div>
      </section>

      <section aria-labelledby="t-produtos" className={`${cartao} space-y-4`}>
        <div>
          <h2 id="t-produtos" className="text-lg font-semibold">
            Produtos fornecidos
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Vincule produtos já cadastrados ou crie produtos novos. Para cada um, informe o prazo de entrega e o preço.
            Esses dados alimentam a tela “Hoje (Reposição)”.
          </p>
        </div>

        {isLoading ? (
          <div className="h-32 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
        ) : isError ? (
          <p className="text-red-700 dark:text-red-400">{mensagemDeErro(error)}</p>
        ) : (
          <>
            <datalist id="unidades-produto">
              {["un", "kg", "g", "cx", "pç", "m", "L", "pct", "rolo"].map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>

            <ul className="space-y-3">
              {linhas.map((l, i) => {
                const un =
                  l.modo === "existente"
                    ? l.produtoId != null
                      ? produtoPorId.get(l.produtoId)?.unidade
                      : undefined
                    : l.novo.unidade.trim() || undefined;
                const idPrazo = `${l.chave}-prazo`;
                const idPreco = `${l.chave}-preco`;
                const idCodigo = `${l.chave}-codigo`;
                const idNome = `${l.chave}-nome`;
                const idUnidade = `${l.chave}-unidade`;
                const idMarca = `${l.chave}-marca`;
                const idPonto = `${l.chave}-ponto`;
                return (
                  <li key={l.chave} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-medium">Produto {i + 1}</p>
                      {linhas.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removerLinha(l.chave)}
                          className="h-9 rounded-md px-3 text-sm font-medium text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                        >
                          Remover
                        </button>
                      )}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-6">
                      <div className="sm:col-span-6">
                        <AlternadorModo modo={l.modo} onChange={(m) => trocarModo(l.chave, m)} />
                      </div>

                      {l.modo === "existente" ? (
                        <div className="sm:col-span-6">
                          <Campo id={`${l.chave}-produto`} rotulo="Produto" obrigatorio erro={erros[`${l.chave}-produto`]}>
                            <SeletorProduto
                              id={`${l.chave}-produto`}
                              produtos={ativos}
                              usados={usados}
                              valor={l.produtoId}
                              erro={erros[`${l.chave}-produto`]}
                              onChange={(produtoId) => atualizarLinha(l.chave, { produtoId }, "produto")}
                              onNovo={(texto) => trocarModo(l.chave, "novo", texto)}
                            />
                          </Campo>
                        </div>
                      ) : (
                        <>
                          <div className="sm:col-span-2">
                            <Campo id={idCodigo} rotulo="Código" obrigatorio erro={erros[idCodigo]}>
                              <input
                                id={idCodigo}
                                autoComplete="off"
                                maxLength={40}
                                value={l.novo.codigo}
                                aria-invalid={erros[idCodigo] ? true : undefined}
                                aria-describedby={erros[idCodigo] ? `${idCodigo}-erro` : undefined}
                                onChange={(e) => atualizarNovo(l.chave, { codigo: e.target.value }, "codigo")}
                                className={`${campo} ${erros[idCodigo] ? bordaErro : bordaOk}`}
                              />
                            </Campo>
                          </div>
                          <div className="sm:col-span-4">
                            <Campo id={idNome} rotulo="Nome do produto" obrigatorio erro={erros[idNome]}>
                              <input
                                id={idNome}
                                autoComplete="off"
                                maxLength={150}
                                value={l.novo.nome}
                                aria-invalid={erros[idNome] ? true : undefined}
                                aria-describedby={erros[idNome] ? `${idNome}-erro` : undefined}
                                onChange={(e) => atualizarNovo(l.chave, { nome: e.target.value }, "nome")}
                                className={`${campo} ${erros[idNome] ? bordaErro : bordaOk}`}
                              />
                            </Campo>
                          </div>
                          <div className="sm:col-span-2">
                            <Campo id={idUnidade} rotulo="Unidade" obrigatorio erro={erros[idUnidade]}>
                              <input
                                id={idUnidade}
                                list="unidades-produto"
                                autoComplete="off"
                                maxLength={10}
                                value={l.novo.unidade}
                                aria-invalid={erros[idUnidade] ? true : undefined}
                                aria-describedby={erros[idUnidade] ? `${idUnidade}-erro` : undefined}
                                onChange={(e) => atualizarNovo(l.chave, { unidade: e.target.value }, "unidade")}
                                className={`${campo} ${erros[idUnidade] ? bordaErro : bordaOk}`}
                              />
                            </Campo>
                          </div>
                          <div className="sm:col-span-2">
                            <Campo id={idMarca} rotulo="Marca">
                              <input
                                id={idMarca}
                                autoComplete="off"
                                maxLength={80}
                                value={l.novo.marca}
                                onChange={(e) => atualizarNovo(l.chave, { marca: e.target.value }, "marca")}
                                className={`${campo} ${bordaOk}`}
                              />
                            </Campo>
                          </div>
                          <div className="sm:col-span-2">
                            <Campo
                              id={idPonto}
                              rotulo="Ponto de reposição"
                              erro={erros[idPonto]}
                              ajuda="Opcional. Sem ele, o produto só entra na sugestão de compra depois de ter consumo."
                            >
                              <input
                                id={idPonto}
                                inputMode="decimal"
                                placeholder="0"
                                value={l.novo.ponto}
                                aria-invalid={erros[idPonto] ? true : undefined}
                                aria-describedby={erros[idPonto] ? `${idPonto}-erro` : undefined}
                                onChange={(e) => atualizarNovo(l.chave, { ponto: e.target.value }, "ponto")}
                                className={`${campo} ${erros[idPonto] ? bordaErro : bordaOk}`}
                              />
                            </Campo>
                          </div>
                          <p className="text-xs text-slate-500 sm:col-span-6 dark:text-slate-400">
                            O produto novo entra no catálogo com saldo 0. O estoque aumenta quando uma compra dele for recebida.
                          </p>
                        </>
                      )}

                      <div className="sm:col-span-2">
                        <Campo id={idPrazo} rotulo="Prazo de entrega (dias)" obrigatorio erro={erros[idPrazo]}>
                          <input
                            id={idPrazo}
                            inputMode="numeric"
                            value={l.prazo}
                            aria-invalid={erros[idPrazo] ? true : undefined}
                            aria-describedby={erros[idPrazo] ? `${idPrazo}-erro` : undefined}
                            onChange={(e) =>
                              atualizarLinha(l.chave, { prazo: e.target.value.replace(/\D/g, "").slice(0, 3) }, "prazo")
                            }
                            className={`${campo} ${erros[idPrazo] ? bordaErro : bordaOk}`}
                          />
                        </Campo>
                      </div>
                      <div className="sm:col-span-2">
                        <Campo id={idPreco} rotulo={`Preço (R$${un ? ` por ${un}` : ""})`} erro={erros[idPreco]}>
                          <input
                            id={idPreco}
                            inputMode="decimal"
                            placeholder="0,00"
                            value={l.preco}
                            aria-invalid={erros[idPreco] ? true : undefined}
                            aria-describedby={erros[idPreco] ? `${idPreco}-erro` : undefined}
                            onChange={(e) => atualizarLinha(l.chave, { preco: e.target.value }, "preco")}
                            className={`${campo} ${erros[idPreco] ? bordaErro : bordaOk}`}
                          />
                        </Campo>
                      </div>
                      <div className="flex items-end sm:col-span-2">
                        <label className="flex min-h-11 items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={l.preferencial}
                            onChange={(e) => atualizarLinha(l.chave, { preferencial: e.target.checked })}
                            className="size-5"
                          />
                          Fornecedor preferencial
                        </label>
                      </div>
                      {l.preferencial && (
                        <p className="text-xs text-slate-500 sm:col-span-6 dark:text-slate-400">
                          Este fornecedor passa a ser o preferencial do produto e substitui o atual, se houver.
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {erros["produtos"] && (
              <p role="alert" className="text-sm text-red-700 dark:text-red-400">
                {erros["produtos"]}
              </p>
            )}
            <button type="button" onClick={() => setLinhas((ls) => [...ls, novaLinha()])} className={botaoSecundario}>
              + Adicionar produto
            </button>
          </>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" className="text-sm text-slate-600 dark:text-slate-400">
          {linhas.length} {linhas.length === 1 ? "produto" : "produtos"} · Compra mínima:{" "}
          {minimo ? fmtMoeda(Number(minimo)) : "não informada"}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={limparTudo} disabled={salvar.isPending} className={botaoSecundario}>
            Limpar formulário
          </button>
          <button
            type="submit"
            disabled={salvar.isPending || isLoading}
            className="h-11 rounded-lg bg-blue-700 px-6 text-sm font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300 dark:bg-blue-600 dark:hover:bg-blue-500 dark:disabled:bg-slate-700"
          >
            {salvar.isPending ? "Cadastrando..." : "Cadastrar fornecedor"}
          </button>
        </div>
      </div>
    </form>
  );
}
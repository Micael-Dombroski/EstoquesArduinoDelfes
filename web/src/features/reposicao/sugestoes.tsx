"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useFornecedores } from "@/features/fornecedores/gestao";
import { api } from "@/lib/api";
import { podeEditarEstoqueMinimo, podeSolicitarCompra, useSessao } from "@/lib/auth";
import { mensagemDeErro } from "@/lib/errors";
import { fmt, fmtMoeda, normaliza, semaforo, type Semaforo } from "@/lib/format";
import {
  useAnaliseReposicaoCompleta,
  useProdutos,
  useSaidasPendentes,
  useSugestoes,
} from "@/lib/hooks";
import type { GrupoSugestao, ItemSugestao } from "@/lib/types";

type ItemManual = {
  produtoId: number;
  codigo: string;
  nome: string;
  unidade: string;
  quantidade: string;
  precoUnitario: string;
  marca: string;
  prazoEntregaDias: number | null;
};

type FiltroCatalogo = "FORNECEDOR" | "TODOS" | "BAIXO_ESTOQUE" | "FALTANTES_SAIDA";

const ESTILO_SEMAFORO: Record<Semaforo, { texto: string; classe: string }> = {
  critico: {
    texto: "Crítico",
    classe: "bg-red-100 text-red-800 dark:bg-red-950/70 dark:text-red-300",
  },
  atencao: {
    texto: "Atenção",
    classe: "bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300",
  },
  ok: {
    texto: "Ok",
    classe: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300",
  },
};

const MOTIVOS_RAPIDOS = [
  "Reposição preventiva de estoque",
  "Atender itens faltantes em solicitação de retirada",
  "Demanda de laboratório / bancada",
  "Complemento de lote do fornecedor",
];

function somarDiasIso(dias: number): string {
  const data = new Date();
  data.setDate(data.getDate() + dias);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${data.getFullYear()}-${p(data.getMonth() + 1)}-${p(data.getDate())}`;
}

export function Sugestoes() {
  const qc = useQueryClient();
  const router = useRouter();
  const { usuario } = useSessao();
  const permitidoSolicitar = podeSolicitarCompra(usuario?.perfil);
  const permitidoEditarMinimo = podeEditarEstoqueMinimo(usuario?.perfil);

  // Estado de edição rápida de estoque mínimo (apenas Almoxarifado e Supervisor)
  const [editandoMinimoId, setEditandoMinimoId] = useState<number | null>(null);
  const [novoMinimo, setNovoMinimo] = useState("");

  // Dados dinâmicos do banco
  const { data: grupos = [], isLoading, isError, error } = useSugestoes();
  const { data: gruposCompletos = [] } = useAnaliseReposicaoCompleta(permitidoSolicitar);
  const { data: produtos = [] } = useProdutos();
  const { data: fornecedores = [] } = useFornecedores(true);
  const { data: saidasPendentes = [] } = useSaidasPendentes(permitidoSolicitar);

  // Estado das sugestões automáticas de baixo estoque
  const [quantidades, setQuantidades] = useState<Record<number, string>>({});
  const [excluidos, setExcluidos] = useState<Record<number, boolean>>({});
  const [itensExtrasGrupo, setItensExtrasGrupo] = useState<Record<number, ItemSugestao[]>>({});
  const [produtoExtraSel, setProdutoExtraSel] = useState<Record<number, string>>({});

  // Estado do construtor dinâmico de solicitação para o estoque
  const [abaAtiva, setAbaAtiva] = useState<"SUGESTOES" | "SOLICITAR">("SUGESTOES");
  const [fornecedorIdManual, setFornecedorIdManual] = useState<number | null>(null);
  const [buscaCatalogo, setBuscaCatalogo] = useState("");
  const [filtroCatalogo, setFiltroCatalogo] = useState<FiltroCatalogo>("FORNECEDOR");
  const [itensManuais, setItensManuais] = useState<ItemManual[]>([]);
  const [observacaoManual, setObservacaoManual] = useState("Reposição preventiva de estoque");
  const [previsaoManual, setPrevisaoManual] = useState("");

  // Mapa rápido de inteligência de reposição por produtoId (vindo de vw_sugestao_reposicao)
  const analisePorProduto = useMemo(() => {
    const mapa = new Map<
      number,
      ItemSugestao & { fornecedorIdSugerido: number | null; fornecedorNomeSugerido: string | null }
    >();
    for (const g of gruposCompletos) {
      for (const item of g.itens) {
        mapa.set(item.produtoId, {
          ...item,
          fornecedorIdSugerido: g.fornecedorId,
          fornecedorNomeSugerido: g.fornecedorNome,
        });
      }
    }
    return mapa;
  }, [gruposCompletos]);

  // Mapa de produtos marcados como NECESSITA_COMPRA nas retiradas pendentes do almoxarifado
  const faltantesPorProduto = useMemo(() => {
    const mapa = new Map<number, number>();
    for (const retirada of saidasPendentes) {
      for (const item of retirada.itens ?? []) {
        const qtdPedida = Number(item.quantidade) || 0;
        const qtdSep = item.separado ? Number(item.quantidadeSeparada ?? item.quantidade) : 0;
        const falta = Math.max(qtdPedida - qtdSep, 0);
        if (falta > 0 && item.situacaoFaltante === "NECESSITA_COMPRA") {
          mapa.set(item.produtoId, (mapa.get(item.produtoId) ?? 0) + falta);
        }
      }
    }
    return mapa;
  }, [saidasPendentes]);

  const fornecedorSelecionado = useMemo(
    () => fornecedores.find((f) => f.id === fornecedorIdManual) ?? null,
    [fornecedores, fornecedorIdManual],
  );

  // Vínculos ProdutoFornecedor do fornecedor selecionado na aba manual
  const vinculoPorProdutoNoFornecedor = useMemo(() => {
    const mapa = new Map<
      number,
      { prazoEntregaDias: number; precoUnitario: string | null; preferencial: boolean }
    >();
    if (!fornecedorSelecionado) return mapa;
    for (const v of fornecedorSelecionado.produtos) {
      mapa.set(v.produtoId, {
        prazoEntregaDias: v.prazoEntregaDias,
        precoUnitario: v.precoUnitario,
        preferencial: v.preferencial,
      });
    }
    return mapa;
  }, [fornecedorSelecionado]);

  // Previsão sugerida automática a partir do maior prazoEntregaDias dos itens no carrinho manual
  const maiorPrazoCarrinho = useMemo(() => {
    const prazos = itensManuais
      .map((i) => i.prazoEntregaDias)
      .filter((p): p is number => p != null && p > 0);
    return prazos.length > 0 ? Math.max(...prazos) : null;
  }, [itensManuais]);

  const previsaoCalculada = previsaoManual || (maiorPrazoCarrinho ? somarDiasIso(maiorPrazoCarrinho) : "");

  // Valor total estimado do carrinho manual
  const totalEstimadoManual = useMemo(() => {
    return itensManuais.reduce((acc, item) => {
      const qtd = Number(String(item.quantidade).replace(",", ".")) || 0;
      const preco = Number(String(item.precoUnitario).replace(",", ".")) || 0;
      return acc + qtd * preco;
    }, 0);
  }, [itensManuais]);

  const minimoFornecedorManual = fornecedorSelecionado?.valorMinimoPedido
    ? Number(fornecedorSelecionado.valorMinimoPedido)
    : null;

  // Catálogo filtrado para a solicitação manual
  const produtosCatalogo = useMemo(() => {
    const termo = normaliza(buscaCatalogo);
    return produtos
      .filter((p) => p.ativo)
      .filter((p) => {
        if (termo && !normaliza(p.nome).includes(termo) && !normaliza(p.codigo).includes(termo)) {
          return false;
        }
        if (filtroCatalogo === "FORNECEDOR" && fornecedorSelecionado) {
          return vinculoPorProdutoNoFornecedor.has(p.id);
        }
        if (filtroCatalogo === "BAIXO_ESTOQUE") {
          const analise = analisePorProduto.get(p.id);
          return Boolean(analise?.precisaRepor) || Number(p.saldoAtual) <= Number(p.pontoReposicao);
        }
        if (filtroCatalogo === "FALTANTES_SAIDA") {
          return faltantesPorProduto.has(p.id);
        }
        return true;
      });
  }, [
    produtos,
    buscaCatalogo,
    filtroCatalogo,
    fornecedorSelecionado,
    vinculoPorProdutoNoFornecedor,
    analisePorProduto,
    faltantesPorProduto,
  ]);

  // Adicionar produto na solicitação manual aproveitando vínculos e cálculos do banco
  function adicionarItemManual(produtoId: number) {
    const prod = produtos.find((p) => p.id === produtoId);
    if (!prod) return;

    const analise = analisePorProduto.get(produtoId);
    let fornIdAlvo = fornecedorIdManual;

    // Se ainda não escolheu fornecedor, seleciona automaticamente o preferencial/sugerido pelo banco
    if (!fornIdAlvo) {
      if (analise?.fornecedorIdSugerido) {
        fornIdAlvo = analise.fornecedorIdSugerido;
      } else {
        const fornComVinculo = fornecedores.find((f) =>
          f.produtos.some((v) => v.produtoId === produtoId),
        );
        if (fornComVinculo) fornIdAlvo = fornComVinculo.id;
      }
      if (fornIdAlvo) {
        setFornecedorIdManual(fornIdAlvo);
      }
    }

    const forn = fornecedores.find((f) => f.id === fornIdAlvo) ?? null;
    const vinculo = forn?.produtos.find((v) => v.produtoId === produtoId) ?? null;

    const faltaSaida = faltantesPorProduto.get(produtoId) ?? 0;
    const qtdSugeridaBanco = analise?.qtdSugerida ? Number(analise.qtdSugerida) : 0;
    const qtdPadrao =
      qtdSugeridaBanco > 0
        ? String(qtdSugeridaBanco)
        : faltaSaida > 0
          ? String(faltaSaida)
          : Number(prod.pontoReposicao) > 0
            ? String(Math.ceil(Number(prod.pontoReposicao)))
            : "10";

    setItensManuais((atuais) => {
      const jaExiste = atuais.find((i) => i.produtoId === produtoId);
      if (jaExiste) {
        toast.info(`${prod.nome} já está na lista da solicitação.`);
        return atuais;
      }
      return [
        ...atuais,
        {
          produtoId: prod.id,
          codigo: prod.codigo,
          nome: prod.nome,
          unidade: prod.unidade,
          quantidade: qtdPadrao,
          precoUnitario: vinculo?.precoUnitario ?? analise?.precoUnitario ?? "",
          marca: prod.marca ?? "",
          prazoEntregaDias: vinculo?.prazoEntregaDias ?? analise?.prazoEntregaDias ?? null,
        },
      ];
    });
  }

  // Ao trocar de fornecedor na aba manual, atualiza preços e prazos dos itens já no carrinho
  function selecionarFornecedorManual(novoId: number | null) {
    setFornecedorIdManual(novoId);
    const forn = fornecedores.find((f) => f.id === novoId) ?? null;
    if (!forn) return;

    setItensManuais((atuais) =>
      atuais.map((item) => {
        const vinc = forn.produtos.find((v) => v.produtoId === item.produtoId);
        return {
          ...item,
          precoUnitario: vinc?.precoUnitario ?? item.precoUnitario,
          prazoEntregaDias: vinc?.prazoEntregaDias ?? item.prazoEntregaDias,
        };
      }),
    );
  }

  // Carregar automaticamente todos os itens marcados como NECESSITA_COMPRA nas retiradas
  function importarFaltantesDeRetiradas() {
    const idsFaltantes = [...faltantesPorProduto.keys()];
    if (idsFaltantes.length === 0) return;

    setAbaAtiva("SOLICITAR");
    setObservacaoManual("Atender itens faltantes em solicitação de retirada");
    for (const id of idsFaltantes) {
      adicionarItemManual(id);
    }
    toast.success("Itens faltantes nas retiradas carregados na solicitação!");
  }

  // Incluir produto extra diretamente dentro de um card de sugestão de fornecedor
  function incluirExtraNoGrupo(fornecedorId: number) {
    const prodId = Number(produtoExtraSel[fornecedorId]);
    if (!prodId) return;

    const prod = produtos.find((p) => p.id === prodId);
    if (!prod) return;

    const forn = fornecedores.find((f) => f.id === fornecedorId);
    const vinc = forn?.produtos.find((v) => v.produtoId === prodId);
    const analise = analisePorProduto.get(prodId);

    const qtdInicial =
      analise && Number(analise.qtdSugerida) > 0
        ? String(analise.qtdSugerida)
        : Number(prod.pontoReposicao) > 0
          ? String(Math.ceil(Number(prod.pontoReposicao)))
          : "10";

    const novoItem: ItemSugestao = {
      produtoId: prod.id,
      codigo: prod.codigo,
      nome: prod.nome,
      unidade: prod.unidade,
      saldoAtual: prod.saldoAtual,
      pontoReposicao: prod.pontoReposicao,
      diasRestantes: analise?.diasRestantes ?? null,
      prazoEntregaDias: vinc?.prazoEntregaDias ?? analise?.prazoEntregaDias ?? null,
      precoUnitario: vinc?.precoUnitario ?? analise?.precoUnitario ?? null,
      precisaRepor: false,
      qtdSugerida: qtdInicial,
    };

    setItensExtrasGrupo((prev) => ({
      ...prev,
      [fornecedorId]: [...(prev[fornecedorId] ?? []), novoItem],
    }));
    setQuantidades((prev) => ({ ...prev, [prod.id]: qtdInicial }));
    setProdutoExtraSel((prev) => ({ ...prev, [fornecedorId]: "" }));
  }

  // Mutação 1: Gerar solicitação a partir do card de sugestão de baixo estoque
  const gerar = useMutation({
    mutationFn: (g: GrupoSugestao) => {
      const extras = g.fornecedorId != null ? (itensExtrasGrupo[g.fornecedorId] ?? []) : [];
      const todosItens = [...g.itens, ...extras];
      return api("/reposicao/rascunhos", {
        method: "POST",
        body: JSON.stringify({
          fornecedorId: g.fornecedorId,
          itens: todosItens
            .filter((i) => !excluidos[i.produtoId])
            .map((i) => ({
              produtoId: i.produtoId,
              quantidade: String(quantidades[i.produtoId] ?? i.qtdSugerida).replace(",", "."),
            })),
        }),
      });
    },
    onSuccess: (_, g) => {
      if (g.fornecedorId != null) {
        setItensExtrasGrupo((prev) => ({ ...prev, [g.fornecedorId!]: [] }));
      }
      qc.invalidateQueries();
      toast.success(
        `Solicitação de reposição criada para ${g.fornecedorNome ?? "o fornecedor"} e enviada para revisão`,
        {
          duration: 6000,
          action: {
            label: "Ver pedidos / OC",
            onClick: () => router.push("/pedidos"),
          },
        },
      );
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  // Mutação 2: Criar solicitação manual dinâmica para o estoque (POST /pedidos-entrada)
  const criarSolicitacaoManual = useMutation({
    mutationFn: async () => {
      if (!fornecedorIdManual) {
        throw new Error("Selecione um fornecedor para enviar a solicitação.");
      }
      if (itensManuais.length === 0) {
        throw new Error("Adicione ao menos um produto na solicitação.");
      }
      const itensPayload = itensManuais.map((i) => {
        const qtdLimpa = String(i.quantidade).replace(",", ".").trim();
        const precoLimpo = String(i.precoUnitario).replace(",", ".").trim();
        return {
          produtoId: i.produtoId,
          quantidade: qtdLimpa,
          marca: i.marca.trim() || null,
          precoUnitario: precoLimpo && Number(precoLimpo) >= 0 ? precoLimpo : null,
        };
      });

      return api("/pedidos-entrada", {
        method: "POST",
        body: JSON.stringify({
          fornecedorId: fornecedorIdManual,
          previsaoEntrega: previsaoCalculada || null,
          observacao: observacaoManual.trim() || "Solicitação de reposição para o estoque",
          itens: itensPayload,
        }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries();
      setItensManuais([]);
      toast.success(
        "Solicitação para o estoque registrada com sucesso e enviada para revisão de Compras / Supervisor!",
        {
          duration: 6000,
          action: {
            label: "Ver pedidos / OC",
            onClick: () => router.push("/pedidos"),
          },
        },
      );
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  // Mutação 3: Atualizar estoque mínimo (pontoReposicao) — restrito a Almoxarifado e Supervisor
  const salvarEstoqueMinimo = useMutation({
    mutationFn: async ({ produtoId, pontoReposicao }: { produtoId: number; pontoReposicao: string }) => {
      const limpo = pontoReposicao.replace(",", ".").trim();
      if (!limpo || Number.isNaN(Number(limpo)) || Number(limpo) < 0) {
        throw new Error("Informe um estoque mínimo válido (maior ou igual a zero).");
      }
      return api(`/produtos/${produtoId}`, {
        method: "PATCH",
        body: JSON.stringify({ pontoReposicao: limpo }),
      });
    },
    onSuccess: () => {
      setEditandoMinimoId(null);
      qc.invalidateQueries({ queryKey: ["produtos"] });
      qc.invalidateQueries({ queryKey: ["reposicao"] });
      toast.success("Estoque mínimo atualizado com sucesso!");
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  function abrirEdicaoMinimo(produtoId: number, valorAtual?: string) {
    setEditandoMinimoId(produtoId);
    setNovoMinimo(String(Number(valorAtual ?? 0)));
  }

  if (isLoading) return <div className="h-40 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />;
  if (isError) return <p className="text-red-700 dark:text-red-400">{mensagemDeErro(error)}</p>;

  const totalBaixoEstoque = grupos.reduce((acc, g) => acc + g.itens.length, 0);
  const totalFaltantesSaida = faltantesPorProduto.size;
  const totalEmTransito = [...analisePorProduto.values()].filter(
    (i) => Number(i.qtdPendente ?? 0) > 0,
  ).length;

  return (
    <div className="space-y-6">
      {/* Banner de notificação de baixo estoque */}
      {totalBaixoEstoque > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50/90 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          <div>
            <p className="font-semibold">
              Alerta de reposição: {totalBaixoEstoque}{" "}
              {totalBaixoEstoque === 1 ? "produto está" : "produtos estão"} com baixo estoque
            </p>
            <p className="text-xs text-amber-800/90 dark:text-amber-300/80">
              Verifique as quantidades sugeridas por fornecedor abaixo ou monte uma solicitação personalizada para o estoque.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-amber-200/80 px-2.5 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-900/70 dark:text-amber-200">
            {totalBaixoEstoque} {totalBaixoEstoque === 1 ? "item" : "itens"}
          </span>
        </div>
      )}

      {/* Alerta dinâmico se houver itens marcados como "Precisa comprar" nas separações do almoxarifado */}
      {totalFaltantesSaida > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-300 bg-red-50/90 px-4 py-3 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          <div>
            <p className="font-semibold">
              Demanda de separação: {totalFaltantesSaida}{" "}
              {totalFaltantesSaida === 1
                ? "produto foi sinalizado como faltante"
                : "produtos foram sinalizados como faltantes"}{" "}
              nas solicitações de retirada
            </p>
            <p className="text-xs text-red-800/90 dark:text-red-300/80">
              O almoxarifado marcou esses materiais como &ldquo;Precisa comprar&rdquo; durante a separação.
            </p>
          </div>
          <button
            type="button"
            onClick={importarFaltantesDeRetiradas}
            className="h-9 shrink-0 rounded-lg bg-red-700 px-3 text-xs font-semibold text-white hover:bg-red-800 dark:bg-red-600 dark:hover:bg-red-500"
          >
            Carregar na solicitação ({totalFaltantesSaida})
          </button>
        </div>
      )}

      {/* Barra de alternância entre Sugestões de Baixo Estoque e Nova Solicitação Dinâmica */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setAbaAtiva("SUGESTOES")}
            className={`flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors ${
              abaAtiva === "SUGESTOES"
                ? "bg-blue-700 text-white dark:bg-blue-600"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            <span>Sugestões de estoque baixo</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                abaAtiva === "SUGESTOES"
                  ? "bg-white/20 text-white"
                  : "bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300"
              }`}
            >
              {totalBaixoEstoque}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setAbaAtiva("SOLICITAR")}
            className={`flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors ${
              abaAtiva === "SOLICITAR"
                ? "bg-blue-700 text-white dark:bg-blue-600"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            <span>+ Solicitar itens para o estoque</span>
            {itensManuais.length > 0 && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  abaAtiva === "SOLICITAR"
                    ? "bg-white/20 text-white"
                    : "bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300"
                }`}
              >
                {itensManuais.length}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
          <span>
            Catálogo ativo: <strong className="text-slate-800 dark:text-slate-200">{produtos.filter((p) => p.ativo).length}</strong>
          </span>
          <span>
            Fornecedores ativos: <strong className="text-slate-800 dark:text-slate-200">{fornecedores.length}</strong>
          </span>
          {totalEmTransito > 0 && (
            <span>
              Produtos com OC a caminho: <strong className="text-blue-600 dark:text-blue-400">{totalEmTransito}</strong>
            </span>
          )}
        </div>
      </div>

      {/* =====================================================================
          ABA 1: SUGESTÕES AUTOMÁTICAS DE ESTOQUE BAIXO
         ===================================================================== */}
      {abaAtiva === "SUGESTOES" && (
        <>
          {grupos.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
              <p className="text-base font-medium text-slate-700 dark:text-slate-300">
                Nenhum produto abaixo do ponto de reposição no momento.
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Deseja adiantar uma compra ou solicitar materiais específicos para o estoque?
              </p>
              <button
                type="button"
                onClick={() => setAbaAtiva("SOLICITAR")}
                className="mt-4 h-10 rounded-lg bg-blue-700 px-4 text-sm font-medium text-white hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                + Solicitar itens manualmente
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {grupos.map((g) => {
                const extras = g.fornecedorId != null ? (itensExtrasGrupo[g.fornecedorId] ?? []) : [];
                const todosItens = [...g.itens, ...extras];
                const itensAtivos = todosItens.filter((i) => !excluidos[i.produtoId]);
                const selecionados = itensAtivos.length;

                const subtotalEstimado = itensAtivos.reduce((acc, i) => {
                  const qtd = Number(String(quantidades[i.produtoId] ?? i.qtdSugerida).replace(",", ".")) || 0;
                  const preco = Number(i.precoUnitario ?? 0) || 0;
                  return acc + qtd * preco;
                }, 0);

                const minimoFornecedor = g.valorMinimoPedido ? Number(g.valorMinimoPedido) : null;
                const abaixoDoMinimo =
                  minimoFornecedor != null && subtotalEstimado > 0 && subtotalEstimado < minimoFornecedor;

                // Outros produtos vinculados a este mesmo fornecedor que ainda não estão no card
                const fornDetalhe =
                  g.fornecedorId != null ? fornecedores.find((f) => f.id === g.fornecedorId) : null;
                const idsJaNoCard = new Set(todosItens.map((i) => i.produtoId));
                const opcoesExtrasFornecedor = (fornDetalhe?.produtos ?? []).filter(
                  (v) => !idsJaNoCard.has(v.produtoId),
                );

                return (
                  <section
                    key={g.fornecedorId ?? "sem"}
                    className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                  >
                    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-800">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-semibold">
                            {g.fornecedorNome ?? "Sem fornecedor cadastrado"}
                          </h2>
                          {minimoFornecedor != null && (
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                              Pedido mín.: {fmtMoeda(minimoFornecedor)}
                            </span>
                          )}
                        </div>
                        {subtotalEstimado > 0 && (
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            Total estimado:{" "}
                            <strong className="text-slate-800 dark:text-slate-200">
                              {fmtMoeda(subtotalEstimado)}
                            </strong>
                            {abaixoDoMinimo && (
                              <span className="ml-2 text-amber-600 dark:text-amber-400">
                                · Faltam {fmtMoeda(minimoFornecedor - subtotalEstimado)} para atingir o mínimo do fornecedor
                              </span>
                            )}
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        disabled={
                          !permitidoSolicitar ||
                          g.fornecedorId == null ||
                          selecionados === 0 ||
                          gerar.isPending
                        }
                        onClick={() => gerar.mutate(g)}
                        className="h-11 rounded-lg bg-blue-700 px-4 text-sm font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300 dark:bg-blue-600 dark:hover:bg-blue-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
                      >
                        Solicitar compra ({selecionados})
                      </button>
                    </header>

                    <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                      {todosItens.map((i) => {
                        const ehExtra = !g.itens.some((orig) => orig.produtoId === i.produtoId);
                        const faltaNaSaida = faltantesPorProduto.get(i.produtoId) ?? 0;

                        return (
                          <li key={i.produtoId} className="flex flex-wrap items-center gap-3 p-4">
                            <input
                              type="checkbox"
                              aria-label={`Incluir ${i.nome}`}
                              checked={!excluidos[i.produtoId]}
                              onChange={(e) =>
                                setExcluidos((x) => ({ ...x, [i.produtoId]: !e.target.checked }))
                              }
                              className="size-5 accent-blue-700 dark:accent-blue-500"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate font-medium">{i.nome}</p>
                                <span className="text-xs text-slate-400 dark:text-slate-500">
                                  {i.codigo}
                                </span>
                                {ehExtra ? (
                                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-800 dark:bg-blue-950/70 dark:text-blue-300">
                                    Incluído manualmente
                                  </span>
                                ) : (
                                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">
                                    Baixo estoque
                                  </span>
                                )}
                                {faltaNaSaida > 0 && (
                                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-800 dark:bg-red-950/70 dark:text-red-300">
                                    Faltam {fmt(faltaNaSaida)} {i.unidade} p/ retirada
                                  </span>
                                )}
                              </div>
                              <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-slate-600 dark:text-slate-400">
                                <span>
                                  Estoque {fmt(i.saldoAtual)} {i.unidade}
                                </span>
                                {i.pontoReposicao != null && (
                                  <>
                                    <span>·</span>
                                    {permitidoEditarMinimo ? (
                                      <button
                                        type="button"
                                        onClick={() => abrirEdicaoMinimo(i.produtoId, i.pontoReposicao)}
                                        title="Clique para editar o estoque mínimo"
                                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium text-slate-700 hover:bg-slate-100 hover:text-blue-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-blue-400"
                                      >
                                        <span>
                                          Ponto mín. {fmt(i.pontoReposicao)} {i.unidade}
                                        </span>
                                        <span className="text-xs text-blue-600 dark:text-blue-400">✎</span>
                                      </button>
                                    ) : (
                                      <span>
                                        Ponto mín. {fmt(i.pontoReposicao)} {i.unidade}
                                      </span>
                                    )}
                                  </>
                                )}
                                <span>
                                  {i.diasRestantes != null && `· acaba em ${fmt(i.diasRestantes)} dias`}
                                  {Number(i.qtdPendente ?? 0) > 0 &&
                                    ` · ${fmt(i.qtdPendente!)} ${i.unidade} já a caminho`}
                                  {i.precoUnitario != null && ` · ${fmtMoeda(i.precoUnitario)} / ${i.unidade}`}
                                  {i.prazoEntregaDias != null && ` · prazo ${i.prazoEntregaDias}d`}
                                </span>
                              </div>

                              {permitidoEditarMinimo && editandoMinimoId === i.produtoId && (
                                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/60 p-2 text-xs dark:border-blue-900/50 dark:bg-blue-950/30">
                                  <span className="font-medium text-slate-700 dark:text-slate-200">
                                    Novo estoque mínimo:
                                  </span>
                                  <input
                                    inputMode="decimal"
                                    autoFocus
                                    value={novoMinimo}
                                    onChange={(e) => setNovoMinimo(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        salvarEstoqueMinimo.mutate({
                                          produtoId: i.produtoId,
                                          pontoReposicao: novoMinimo,
                                        });
                                      } else if (e.key === "Escape") {
                                        setEditandoMinimoId(null);
                                      }
                                    }}
                                    className="h-8 w-20 rounded-md border border-blue-400 bg-white px-2 text-right tabular-nums dark:border-blue-700 dark:bg-slate-950 dark:text-slate-100"
                                  />
                                  <span className="text-slate-600 dark:text-slate-400">{i.unidade}</span>
                                  {i.pontoSugerido && Number(i.pontoSugerido) > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => setNovoMinimo(String(Number(i.pontoSugerido)))}
                                      className="rounded bg-blue-100 px-2 py-1 text-[11px] font-medium text-blue-800 hover:bg-blue-200 dark:bg-blue-900/60 dark:text-blue-200"
                                    >
                                      Usar sugerido ({fmt(i.pontoSugerido)})
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    disabled={salvarEstoqueMinimo.isPending}
                                    onClick={() =>
                                      salvarEstoqueMinimo.mutate({
                                        produtoId: i.produtoId,
                                        pontoReposicao: novoMinimo,
                                      })
                                    }
                                    className="h-8 rounded-md bg-blue-700 px-2.5 font-medium text-white hover:bg-blue-800 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
                                  >
                                    Salvar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditandoMinimoId(null)}
                                    className="h-8 rounded-md border border-slate-300 bg-white px-2 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              )}
                            </div>
                            <label className="flex items-center gap-2 text-sm">
                              <span className="sr-only">Quantidade a comprar de {i.nome}</span>
                              <input
                                inputMode="decimal"
                                value={quantidades[i.produtoId] ?? i.qtdSugerida}
                                onChange={(e) =>
                                  setQuantidades((q) => ({ ...q, [i.produtoId]: e.target.value }))
                                }
                                className="h-11 w-24 rounded-lg border border-slate-300 bg-white px-3 text-right tabular-nums dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                              />
                              <span className="w-6 text-slate-600 dark:text-slate-400">{i.unidade}</span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>

                    {/* Seletor rápido para adicionar outros produtos vinculados a este mesmo fornecedor */}
                    {g.fornecedorId != null && opcoesExtrasFornecedor.length > 0 && (
                      <footer className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/30">
                        <select
                          aria-label={`Adicionar produto ao pedido de ${g.fornecedorNome}`}
                          value={produtoExtraSel[g.fornecedorId] ?? ""}
                          onChange={(e) =>
                            setProdutoExtraSel((prev) => ({
                              ...prev,
                              [g.fornecedorId!]: e.target.value,
                            }))
                          }
                          className="h-9 min-w-60 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                        >
                          <option value="">
                            + Incluir outro produto fornecido por {g.fornecedorNome}...
                          </option>
                          {opcoesExtrasFornecedor.map((v) => {
                            const pCat = produtos.find((p) => p.id === v.produtoId);
                            return (
                              <option key={v.produtoId} value={v.produtoId}>
                                {v.produto.nome} ({v.produto.codigo})
                                {pCat ? ` · Saldo: ${fmt(pCat.saldoAtual)} ${v.produto.unidade}` : ""}
                                {v.precoUnitario ? ` · ${fmtMoeda(v.precoUnitario)}` : ""}
                              </option>
                            );
                          })}
                        </select>
                        <button
                          type="button"
                          disabled={!produtoExtraSel[g.fornecedorId]}
                          onClick={() => incluirExtraNoGrupo(g.fornecedorId!)}
                          className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          Adicionar ao card
                        </button>
                      </footer>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* =====================================================================
          ABA 2: NOVA SOLICITAÇÃO DINÂMICA DE ITENS PARA O ESTOQUE
         ===================================================================== */}
      {abaAtiva === "SOLICITAR" && (
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Coluna esquerda: Escolha do Fornecedor + Catálogo Inteligente de Produtos */}
          <div className="space-y-4 lg:col-span-7">
            <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-3 flex items-center justify-between gap-2">
                <label htmlFor="select-fornecedor-reposicao" className="text-sm font-semibold">
                  1. Fornecedor da solicitação
                </label>
                {fornecedorSelecionado && (
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {fornecedorSelecionado.produtos.length} produto(s) tabelado(s)
                    {fornecedorSelecionado.valorMinimoPedido &&
                      ` · Mínimo ${fmtMoeda(fornecedorSelecionado.valorMinimoPedido)}`}
                  </span>
                )}
              </div>

              <select
                id="select-fornecedor-reposicao"
                value={fornecedorIdManual ?? ""}
                onChange={(e) =>
                  selecionarFornecedorManual(e.target.value ? Number(e.target.value) : null)
                }
                className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="">
                  Selecione um fornecedor (ou escolha um produto abaixo para auto-selecionar)...
                </option>
                {fornecedores.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                    {f.valorMinimoPedido ? ` — Mín. ${fmtMoeda(f.valorMinimoPedido)}` : ""}
                    {` (${f.produtos.length} itens vinculados)`}
                  </option>
                ))}
              </select>
            </section>

            {/* Catálogo dinâmico de produtos */}
            <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">2. Selecionar produtos para o estoque</h2>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setFiltroCatalogo("FORNECEDOR")}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                      filtroCatalogo === "FORNECEDOR"
                        ? "bg-blue-700 text-white dark:bg-blue-600"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    Do fornecedor
                  </button>
                  <button
                    type="button"
                    onClick={() => setFiltroCatalogo("TODOS")}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                      filtroCatalogo === "TODOS"
                        ? "bg-blue-700 text-white dark:bg-blue-600"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    Todos os produtos
                  </button>
                  <button
                    type="button"
                    onClick={() => setFiltroCatalogo("BAIXO_ESTOQUE")}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                      filtroCatalogo === "BAIXO_ESTOQUE"
                        ? "bg-amber-600 text-white"
                        : "bg-amber-100/80 text-amber-800 hover:bg-amber-200/80 dark:bg-amber-950/60 dark:text-amber-300"
                    }`}
                  >
                    Baixo estoque ({totalBaixoEstoque})
                  </button>
                  {totalFaltantesSaida > 0 && (
                    <button
                      type="button"
                      onClick={() => setFiltroCatalogo("FALTANTES_SAIDA")}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                        filtroCatalogo === "FALTANTES_SAIDA"
                          ? "bg-red-600 text-white"
                          : "bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-950/60 dark:text-red-300"
                      }`}
                    >
                      Faltantes em retiradas ({totalFaltantesSaida})
                    </button>
                  )}
                </div>
              </div>

              <input
                type="search"
                value={buscaCatalogo}
                onChange={(e) => setBuscaCatalogo(e.target.value)}
                placeholder="Buscar produto por nome ou código (ex: RES-10K, Arduino, Solda)..."
                className="mb-3 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />

              <div className="max-h-96 divide-y divide-slate-200 overflow-y-auto rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                {produtosCatalogo.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                    {filtroCatalogo === "FORNECEDOR" && fornecedorSelecionado
                      ? "Nenhum produto vinculado diretamente a este fornecedor com esse filtro. Clique em 'Todos os produtos' para buscar em todo o catálogo."
                      : "Nenhum produto encontrado para o filtro informado."}
                  </div>
                ) : (
                  produtosCatalogo.map((p) => {
                    const statusSem = ESTILO_SEMAFORO[semaforo(p.saldoAtual, p.pontoReposicao)];
                    const vinc = vinculoPorProdutoNoFornecedor.get(p.id);
                    const analise = analisePorProduto.get(p.id);
                    const faltaSaida = faltantesPorProduto.get(p.id) ?? 0;
                    const jaAdicionado = itensManuais.some((i) => i.produtoId === p.id);

                    return (
                      <div
                        key={p.id}
                        className="flex flex-wrap items-center justify-between gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-sm">{p.nome}</span>
                            <span className="text-xs text-slate-400 dark:text-slate-500">
                              {p.codigo}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusSem.classe}`}
                            >
                              {statusSem.texto}
                            </span>
                            {vinc?.preferencial && (
                              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-800 dark:bg-blue-950/70 dark:text-blue-300">
                                Fornecedor preferencial
                              </span>
                            )}
                            {faltaSaida > 0 && (
                              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-800 dark:bg-red-950/70 dark:text-red-300">
                                Falta em retirada: {fmt(faltaSaida)} {p.unidade}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                            <span>
                              Saldo:{" "}
                              <strong className="text-slate-700 dark:text-slate-300">
                                {fmt(p.saldoAtual)} {p.unidade}
                              </strong>
                            </span>
                            <span>·</span>
                            {permitidoEditarMinimo ? (
                              <button
                                type="button"
                                onClick={() => abrirEdicaoMinimo(p.id, p.pontoReposicao)}
                                title="Clique para editar o estoque mínimo"
                                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium text-slate-700 hover:bg-slate-100 hover:text-blue-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-blue-400"
                              >
                                <span>
                                  Ponto mín.: {fmt(p.pontoReposicao)} {p.unidade}
                                </span>
                                <span className="text-[11px] text-blue-600 dark:text-blue-400">✎</span>
                              </button>
                            ) : (
                              <span>
                                Ponto mín.: {fmt(p.pontoReposicao)} {p.unidade}
                              </span>
                            )}
                            <span>
                              {Number(analise?.qtdPendente ?? 0) > 0 &&
                                `· Em trânsito: ${fmt(analise!.qtdPendente!)} ${p.unidade}`}
                              {vinc?.precoUnitario
                                ? ` · Tabelado: ${fmtMoeda(vinc.precoUnitario)} (${vinc.prazoEntregaDias}d)`
                                : analise?.fornecedorNomeSugerido
                                  ? ` · Sugerido: ${analise.fornecedorNomeSugerido}`
                                  : ""}
                            </span>
                          </div>

                          {permitidoEditarMinimo && editandoMinimoId === p.id && (
                            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/60 p-2 text-xs dark:border-blue-900/50 dark:bg-blue-950/30">
                              <span className="font-medium text-slate-700 dark:text-slate-200">
                                Novo mín.:
                              </span>
                              <input
                                inputMode="decimal"
                                autoFocus
                                value={novoMinimo}
                                onChange={(e) => setNovoMinimo(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    salvarEstoqueMinimo.mutate({
                                      produtoId: p.id,
                                      pontoReposicao: novoMinimo,
                                    });
                                  } else if (e.key === "Escape") {
                                    setEditandoMinimoId(null);
                                  }
                                }}
                                className="h-7 w-18 rounded-md border border-blue-400 bg-white px-2 text-right tabular-nums dark:border-blue-700 dark:bg-slate-950 dark:text-slate-100"
                              />
                              <span className="text-slate-600 dark:text-slate-400">{p.unidade}</span>
                              {analise?.pontoSugerido && Number(analise.pontoSugerido) > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setNovoMinimo(String(Number(analise.pontoSugerido)))}
                                  className="rounded bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-800 hover:bg-blue-200 dark:bg-blue-900/60 dark:text-blue-200"
                                >
                                  Sugerido ({fmt(analise.pontoSugerido)})
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={salvarEstoqueMinimo.isPending}
                                onClick={() =>
                                  salvarEstoqueMinimo.mutate({
                                    produtoId: p.id,
                                    pontoReposicao: novoMinimo,
                                  })
                                }
                                className="h-7 rounded-md bg-blue-700 px-2 font-medium text-white hover:bg-blue-800 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
                              >
                                Salvar
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditandoMinimoId(null)}
                                className="h-7 rounded-md border border-slate-300 bg-white px-2 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                              >
                                Cancelar
                              </button>
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          disabled={jaAdicionado}
                          onClick={() => adicionarItemManual(p.id)}
                          className={`h-9 shrink-0 rounded-lg px-3 text-xs font-medium transition-colors ${
                            jaAdicionado
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                              : "bg-blue-700 text-white hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500"
                          }`}
                        >
                          {jaAdicionado ? "Na lista ✓" : "+ Incluir"}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>

          {/* Coluna direita: Carrinho da Solicitação para o Estoque */}
          <div className="lg:col-span-5">
            <section className="sticky top-6 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
                <div>
                  <h2 className="font-semibold">3. Resumo da solicitação</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Solicitante: <strong>{usuario?.nome ?? "Almoxarifado"}</strong>
                  </p>
                </div>
                {itensManuais.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setItensManuais([])}
                    className="text-xs text-red-600 hover:underline dark:text-red-400"
                  >
                    Limpar lista
                  </button>
                )}
              </div>

              {itensManuais.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  Selecione os produtos ao lado para montar a solicitação de reposição para o estoque.
                </div>
              ) : (
                <ul className="mb-4 max-h-80 divide-y divide-slate-200 overflow-y-auto dark:divide-slate-800">
                  {itensManuais.map((item) => {
                    const analise = analisePorProduto.get(item.produtoId);
                    const qtdSug = analise?.qtdSugerida ? Number(analise.qtdSugerida) : 0;

                    return (
                      <li key={item.produtoId} className="space-y-2 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium">{item.nome}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {item.codigo}
                              {item.prazoEntregaDias != null &&
                                ` · Prazo fornecedor: ${item.prazoEntregaDias} dia(s)`}
                              {qtdSug > 0 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setItensManuais((atuais) =>
                                      atuais.map((i) =>
                                        i.produtoId === item.produtoId
                                          ? { ...i, quantidade: String(qtdSug) }
                                          : i,
                                      ),
                                    )
                                  }
                                  className="ml-2 text-blue-600 hover:underline dark:text-blue-400"
                                >
                                  Usar sugerida ({fmt(qtdSug)} {item.unidade})
                                </button>
                              )}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setItensManuais((atuais) =>
                                atuais.filter((i) => i.produtoId !== item.produtoId),
                              )
                            }
                            className="text-xs text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                            aria-label={`Remover ${item.nome}`}
                          >
                            Remover
                          </button>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="mb-1 block text-[11px] text-slate-500 dark:text-slate-400">
                              Qtd. ({item.unidade})
                            </label>
                            <input
                              inputMode="decimal"
                              value={item.quantidade}
                              onChange={(e) =>
                                setItensManuais((atuais) =>
                                  atuais.map((i) =>
                                    i.produtoId === item.produtoId
                                      ? { ...i, quantidade: e.target.value }
                                      : i,
                                  ),
                                )
                              }
                              className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-right text-xs tabular-nums dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                            />
                          </div>

                          <div>
                            <label className="mb-1 block text-[11px] text-slate-500 dark:text-slate-400">
                              Preço unit. (R$)
                            </label>
                            <input
                              inputMode="decimal"
                              placeholder="Opcional"
                              value={item.precoUnitario}
                              onChange={(e) =>
                                setItensManuais((atuais) =>
                                  atuais.map((i) =>
                                    i.produtoId === item.produtoId
                                      ? { ...i, precoUnitario: e.target.value }
                                      : i,
                                  ),
                                )
                              }
                              className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-right text-xs tabular-nums dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                            />
                          </div>

                          <div>
                            <label className="mb-1 block text-[11px] text-slate-500 dark:text-slate-400">
                              Marca
                            </label>
                            <input
                              type="text"
                              placeholder="Padrão"
                              value={item.marca}
                              onChange={(e) =>
                                setItensManuais((atuais) =>
                                  atuais.map((i) =>
                                    i.produtoId === item.produtoId
                                      ? { ...i, marca: e.target.value }
                                      : i,
                                  ),
                                )
                              }
                              className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                            />
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Previsão de entrega e Observação / Justificativa */}
              <div className="space-y-3 border-t border-slate-200 pt-3 dark:border-slate-800">
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label htmlFor="previsao-manual" className="text-xs font-medium">
                      Previsão estimada de entrega
                    </label>
                    {maiorPrazoCarrinho != null && (
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        Calculada pelo prazo do fornecedor ({maiorPrazoCarrinho}d)
                      </span>
                    )}
                  </div>
                  <input
                    id="previsao-manual"
                    type="date"
                    value={previsaoCalculada}
                    onChange={(e) => setPrevisaoManual(e.target.value)}
                    className="h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label htmlFor="obs-manual" className="mb-1 block text-xs font-medium">
                    Motivo / Observação da solicitação
                  </label>
                  <div className="mb-1.5 flex flex-wrap gap-1">
                    {MOTIVOS_RAPIDOS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setObservacaoManual(m)}
                        className={`rounded-md px-2 py-0.5 text-[11px] ${
                          observacaoManual === m
                            ? "bg-blue-100 font-medium text-blue-800 dark:bg-blue-950/80 dark:text-blue-300"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400"
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                  <input
                    id="obs-manual"
                    type="text"
                    value={observacaoManual}
                    onChange={(e) => setObservacaoManual(e.target.value)}
                    placeholder="Descreva a finalidade ou urgência desta solicitação..."
                    className="h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>

                {/* Indicador de valor total vs pedido mínimo do fornecedor */}
                {itensManuais.length > 0 && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/50">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 dark:text-slate-400">Valor total estimado:</span>
                      <strong className="text-sm text-slate-900 dark:text-slate-100">
                        {fmtMoeda(totalEstimadoManual)}
                      </strong>
                    </div>
                    {minimoFornecedorManual != null && (
                      <p
                        className={`mt-1 text-[11px] ${
                          totalEstimadoManual < minimoFornecedorManual
                            ? "text-amber-700 dark:text-amber-400"
                            : "text-emerald-700 dark:text-emerald-400"
                        }`}
                      >
                        {totalEstimadoManual < minimoFornecedorManual
                          ? `Atenção: abaixo do pedido mínimo do fornecedor (${fmtMoeda(minimoFornecedorManual)}).`
                          : `Pedido mínimo do fornecedor atingido (${fmtMoeda(minimoFornecedorManual)}).`}
                      </p>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  disabled={
                    !permitidoSolicitar ||
                    !fornecedorIdManual ||
                    itensManuais.length === 0 ||
                    criarSolicitacaoManual.isPending
                  }
                  onClick={() => criarSolicitacaoManual.mutate()}
                  className="h-11 w-full rounded-lg bg-blue-700 text-sm font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300 dark:bg-blue-600 dark:hover:bg-blue-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
                >
                  {criarSolicitacaoManual.isPending
                    ? "Enviando solicitação..."
                    : `Enviar solicitação para o estoque (${itensManuais.length})`}
                </button>
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

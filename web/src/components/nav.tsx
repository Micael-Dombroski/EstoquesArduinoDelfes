"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTema } from "@/app/providers";
import { ROTULO_PERFIL, podeBaixarRetirada, podeSolicitarCompra, podeVerFornecedores, useSessao } from "@/lib/auth";
import { usePedidosEntrada, useRecebimentos, useSaidasPendentes } from "@/lib/hooks";

const LINKS = [
  { href: "/saida", rotulo: "Retirar material", destaque: true, apenasCompras: false, badgeSaida: true },
  { href: "/", rotulo: "Hoje (Reposição)", apenasCompras: true },
  { href: "/pedidos", rotulo: "Pedidos e OC", apenasCompras: true, badgeRascunho: true },
  { href: "/recebimento", rotulo: "Recebimento (OC / NF)", apenasCompras: true, badgeNf: true },
  { href: "/produtos", rotulo: "Produtos", apenasCompras: false },
    { href: "/fornecedores", rotulo: "Fornecedores", apenasCompras: false, ocultoSolicitante: true },
];

function IconeSol() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-4">
      <path d="M10 2a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 2ZM10 15a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 15ZM10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM15.657 5.404a.75.75 0 1 0-1.06-1.06l-1.061 1.06a.75.75 0 0 0 1.06 1.06l1.06-1.06ZM6.464 14.596a.75.75 0 1 0-1.06-1.06l-1.06 1.06a.75.75 0 0 0 1.06 1.06l1.06-1.06ZM18 10a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 18 10ZM5 10a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 5 10ZM14.596 15.657a.75.75 0 0 0 1.06-1.06l-1.06-1.061a.75.75 0 1 0-1.06 1.06l1.06 1.06ZM5.404 6.464a.75.75 0 0 0 1.06-1.06l-1.06-1.06a.75.75 0 1 0-1.061 1.06l1.06 1.06Z" />
    </svg>
  );
}

function IconeLua() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-4">
      <path
        fillRule="evenodd"
        d="M7.455 2.004a.75.75 0 0 1 .26.77 7 7 0 0 0 9.958 7.967.75.75 0 0 1 1.067.853A8.5 8.5 0 1 1 6.647 1.921a.75.75 0 0 1 .808.083Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const { tema, definirTema, alternarTema } = useTema();
  const { usuario, limparSessao } = useSessao();
  const temAcessoCompras = podeSolicitarCompra(usuario?.perfil);
  const temAcessoBaixaSaida = podeBaixarRetirada(usuario?.perfil);
  const { data: rascunhos = [] } = usePedidosEntrada("RASCUNHO", temAcessoCompras);
  const { data: pendentesNf = [] } = useRecebimentos("AGUARDANDO_NF", temAcessoCompras);
  const { data: saidasPendentes = [] } = useSaidasPendentes(temAcessoBaixaSaida);

  const ativo = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
    const linksVisiveis = LINKS.filter(
    (l) =>
      (!l.apenasCompras || podeSolicitarCompra(usuario?.perfil)) &&
      (!l.ocultoSolicitante || podeVerFornecedores(usuario?.perfil)),
  );
  const infoPerfil = usuario ? ROTULO_PERFIL[usuario.perfil] : null;
  const qtdRascunhos = temAcessoCompras ? rascunhos.length : 0;
  const qtdPendentesNf = temAcessoCompras ? pendentesNf.length : 0;
  const qtdSaidasPendentes = temAcessoBaixaSaida ? saidasPendentes.length : 0;

  function sair() {
    limparSessao();
    router.push("/login");
  }

  return (
    <>
      {/* Desktop: barra lateral */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col gap-1 border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 md:flex">
        <p className="mb-4 px-3 text-lg font-semibold">Estoque</p>
        {linksVisiveis.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`flex h-11 items-center justify-between rounded-lg px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-blue-700 dark:focus-visible:outline-blue-400 ${
              l.destaque
                ? "bg-blue-700 text-white hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500"
                : ativo(l.href)
                  ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            }`}
          >
            <span>{l.rotulo === "Retirar material" && usuario?.perfil === "SOLICITANTE" ? "Solicitar material" : l.rotulo}</span>
            {l.badgeSaida && qtdSaidasPendentes > 0 && (
              <span className="rounded-full bg-white/95 px-2 py-0.5 text-xs font-bold text-blue-800">
                {qtdSaidasPendentes}
              </span>
            )}
            {l.badgeRascunho && qtdRascunhos > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/80 dark:text-amber-300">
                {qtdRascunhos}
              </span>
            )}
            {l.badgeNf && qtdPendentesNf > 0 && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-950/80 dark:text-blue-300">
                {qtdPendentesNf}
              </span>
            )}
          </Link>
        ))}

        <div className="mt-auto space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
          {usuario && infoPerfil && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${infoPerfil.cor}`}>
                  {infoPerfil.nome}
                </span>
              </div>
              <p className="truncate text-sm font-semibold">{usuario.nome}</p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">{usuario.email}</p>
              <button
                type="button"
                onClick={sair}
                className="mt-2.5 h-8 w-full rounded-md border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Trocar perfil / Sair
              </button>
            </div>
          )}

          <div>
            <p className="mb-2 px-1 text-xs font-medium text-slate-500 dark:text-slate-400">Tema</p>
            <div
              role="group"
              aria-label="Escolher tema"
              className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800"
            >
              <button
                type="button"
                onClick={() => definirTema("claro")}
                aria-pressed={tema === "claro"}
                className={`flex h-9 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-blue-700 dark:focus-visible:outline-blue-400 ${
                  tema === "claro"
                    ? "bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-slate-100"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                <IconeSol />
                Claro
              </button>
              <button
                type="button"
                onClick={() => definirTema("escuro")}
                aria-pressed={tema === "escuro"}
                className={`flex h-9 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-blue-700 dark:focus-visible:outline-blue-400 ${
                  tema === "escuro"
                    ? "bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-slate-100"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                <IconeLua />
                Escuro
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Celular e tablet: barra inferior */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 md:hidden">
        {linksVisiveis.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`flex h-14 flex-1 items-center justify-center text-xs font-medium ${
              ativo(l.href) ? "text-blue-700 dark:text-blue-400" : "text-slate-600 dark:text-slate-400"
            }`}
          >
            {l.rotulo}
          </Link>
        ))}
        <button
          type="button"
          onClick={alternarTema}
          aria-label={tema === "escuro" ? "Mudar para tema claro" : "Mudar para tema escuro"}
          className="flex h-14 items-center justify-center gap-1 px-3 text-xs font-medium text-slate-600 dark:text-slate-400"
        >
          {tema === "escuro" ? <IconeSol /> : <IconeLua />}
        </button>
        <button
          type="button"
          onClick={sair}
          className="flex h-14 items-center justify-center px-3 text-xs font-medium text-red-700 dark:text-red-400"
        >
          Sair
        </button>
      </nav>
    </>
  );
}

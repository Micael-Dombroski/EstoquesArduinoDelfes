"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/saida", rotulo: "Retirar material", destaque: true },
  { href: "/", rotulo: "Hoje" },
  { href: "/produtos", rotulo: "Produtos" },
];

export function Nav() {
  const pathname = usePathname();
  const ativo = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
      {/* Desktop: barra lateral */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col gap-1 border-r border-slate-200 bg-white p-4 md:flex">
        <p className="mb-4 px-3 text-lg font-semibold">Estoque</p>
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`flex h-11 items-center rounded-lg px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-blue-700 ${
              l.destaque
                ? "bg-blue-700 text-white hover:bg-blue-800"
                : ativo(l.href)
                  ? "bg-slate-100 text-slate-900"
                  : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {l.rotulo}
          </Link>
        ))}
      </aside>

      {/* Celular e tablet: barra inferior */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-slate-200 bg-white md:hidden">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`flex h-14 flex-1 items-center justify-center text-sm font-medium ${
              ativo(l.href) ? "text-blue-700" : "text-slate-600"
            }`}
          >
            {l.rotulo}
          </Link>
        ))}
      </nav>
    </>
  );
}

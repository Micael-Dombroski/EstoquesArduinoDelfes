"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Nav } from "@/components/nav";
import { podeGerenciarUsuarios, useSessao } from "@/lib/auth";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { autenticado, usuario } = useSessao();

  const rotaPermitidaSolicitante = pathname.startsWith("/saida") || pathname.startsWith("/produtos");
  const bloqueadoSolicitante = usuario?.perfil === "SOLICITANTE" && !rotaPermitidaSolicitante;
  const bloqueadoSupervisor = pathname.startsWith("/usuarios") && !podeGerenciarUsuarios(usuario?.perfil);
  const bloqueadoPorPerfil = bloqueadoSolicitante || bloqueadoSupervisor;

  useEffect(() => {
    if (!autenticado) {
      router.replace("/login");
    } else if (bloqueadoSolicitante) {
      router.replace("/saida");
    } else if (bloqueadoSupervisor) {
      router.replace("/");
    }
  }, [autenticado, bloqueadoSolicitante, bloqueadoSupervisor, router]);

  if (!autenticado || bloqueadoPorPerfil) {
    return null;
  }

  return (
    <div className="min-h-screen md:pl-60">
      <Nav />
      <main className="mx-auto max-w-4xl p-4 pb-24 md:p-8">{children}</main>
    </div>
  );
}

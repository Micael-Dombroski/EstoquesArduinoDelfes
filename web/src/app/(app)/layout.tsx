"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Nav } from "@/components/nav";
import { useSessao } from "@/lib/auth";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { autenticado } = useSessao();

  useEffect(() => {
    if (!autenticado) {
      router.replace("/login");
    }
  }, [autenticado, router]);

  if (!autenticado) {
    return null;
  }

  return (
    <div className="min-h-screen md:pl-60">
      <Nav />
      <main className="mx-auto max-w-4xl p-4 pb-24 md:p-8">{children}</main>
    </div>
  );
}
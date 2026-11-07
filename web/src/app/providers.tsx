"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useSyncExternalStore } from "react";
import { Toaster } from "sonner";

export type Tema = "claro" | "escuro";

const CHAVE_TEMA = "estoque:tema";
const EVENTO_TEMA = "estoque:tema-change";

function inscreverTema(callback: () => void) {
  window.addEventListener(EVENTO_TEMA, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENTO_TEMA, callback);
    window.removeEventListener("storage", callback);
  };
}

function lerTemaCliente(): Tema {
  return document.documentElement.classList.contains("dark") ? "escuro" : "claro";
}

function lerTemaServidor(): Tema {
  return "claro";
}

export function useTema() {
  const tema = useSyncExternalStore(inscreverTema, lerTemaCliente, lerTemaServidor);

  function definirTema(novo: Tema) {
    document.documentElement.classList.toggle("dark", novo === "escuro");
    try {
      localStorage.setItem(CHAVE_TEMA, novo);
    } catch {}
    window.dispatchEvent(new Event(EVENTO_TEMA));
  }

  function alternarTema() {
    definirTema(tema === "escuro" ? "claro" : "escuro");
  }

  return { tema, definirTema, alternarTema };
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true } } }),
  );
  const { tema } = useTema();

  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster theme={tema === "escuro" ? "dark" : "light"} richColors position="top-center" />
    </QueryClientProvider>
  );
}

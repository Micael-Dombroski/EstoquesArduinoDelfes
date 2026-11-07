export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: unknown[] = [],
  ) {
    super(message);
  }
}

// O Next encaminha /api/* para a API Express (rewrites no next.config.ts).
const BASE = "/api/v1";

export async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const e = body?.error;
    throw new ApiError(res.status, e?.code ?? "ERRO_DESCONHECIDO", e?.message ?? "Erro inesperado", e?.details ?? []);
  }
  return body as T;
}

// Aceita lista pura, { data: [...] } ou { items: [...] }.
export function unwrapList<T>(body: unknown): T[] {
  if (Array.isArray(body)) return body as T[];
  const b = body as { data?: T[]; items?: T[] } | null;
  return b?.data ?? b?.items ?? [];
}

// Aceita { data, meta: { total } }, { items, total } ou lista pura.
export function unwrapPage<T>(body: unknown): { itens: T[]; total: number } {
  const b = body as
    | { data?: T[]; items?: T[]; total?: number; meta?: { total?: number }; pagination?: { total?: number } }
    | T[]
    | null;
  const itens = Array.isArray(b) ? b : (b?.data ?? b?.items ?? []);
  const total = Array.isArray(b) ? itens.length : Number(b?.meta?.total ?? b?.pagination?.total ?? b?.total ?? itens.length);
  return { itens, total };
}

// Aceita { data: {...} } ou o próprio objeto.
export function unwrapOne<T>(body: unknown): T {
  const b = body as { data?: T } | null;
  return (b?.data ?? b) as T;
}

// Quantidades são strings decimais; formate só na exibição.
export function fmt(valor: string | number): string {
  return Number(valor).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

// Minúsculas e sem acento, para busca tolerante.
export function normaliza(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export type Semaforo = "critico" | "atencao" | "ok";

export function semaforo(saldo: string, ponto: string): Semaforo {
  const s = Number(saldo);
  const p = Number(ponto);
  if (s <= p) return "critico";
  if (s <= p * 1.5) return "atencao";
  return "ok";
}

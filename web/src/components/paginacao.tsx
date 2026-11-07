"use client";

type Props = {
  pagina: number;
  limite: number;
  total: number;
  tamanhos: number[];
  ocupado: boolean;
  rotulo: string; // ex.: "pedidos", "retiradas"
  onPagina: (pagina: number) => void;
  onLimite: (limite: number) => void;
};

const botao =
  "h-11 rounded-lg border border-slate-300 bg-white px-4 font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50";

// Mesma lógica do histórico de retiradas: tamanhos de página, anterior/próxima e contador.
export function Paginacao({ pagina, limite, total, tamanhos, ocupado, rotulo, onPagina, onLimite }: Props) {
  const totalPaginas = Math.max(1, Math.ceil(total / limite));
  const inicio = total === 0 ? 0 : (pagina - 1) * limite + 1;
  const fim = Math.min(pagina * limite, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p aria-live="polite" className="text-slate-600">
        Mostrando {inicio}–{fim} de {total} {rotulo}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          Por página
          <select
            value={limite}
            onChange={(e) => onLimite(Number(e.target.value))}
            className="h-11 rounded-lg border border-slate-300 bg-white px-2"
          >
            {tamanhos.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => onPagina(Math.max(1, pagina - 1))} disabled={pagina <= 1 || ocupado} className={botao}>
          Anterior
        </button>
        <span className="tabular-nums">
          Página {pagina} de {totalPaginas}
        </span>
        <button
          type="button"
          onClick={() => onPagina(Math.min(totalPaginas, pagina + 1))}
          disabled={pagina >= totalPaginas || ocupado}
          className={botao}
        >
          Próxima
        </button>
      </div>
    </div>
  );
}

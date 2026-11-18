import { Sugestoes } from "@/features/reposicao/sugestoes";

export default function HojePage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold">Reposição</h1>
      <p className="mb-6 text-slate-600 dark:text-slate-400">
        Acompanhe as sugestões de produtos com baixo estoque ou solicite a compra de itens manualmente.
      </p>
      <Sugestoes />
    </>
  );
}
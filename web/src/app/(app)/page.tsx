import { Sugestoes } from "@/features/reposicao/sugestoes";

export default function HojePage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold">O que comprar hoje</h1>
      <p className="mb-6 text-slate-600">Produtos que vão acabar antes de o próximo pedido chegar.</p>
      <Sugestoes />
    </>
  );
}

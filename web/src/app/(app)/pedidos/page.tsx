import { Acompanhamento } from "@/features/entradas/acompanhamento";

export default function PedidosPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold">Acompanhar pedidos</h1>
      <p className="mb-6 text-slate-600">Veja o que foi pedido aos fornecedores, o status e quando deve chegar.</p>
      <Acompanhamento />
    </>
  );
}

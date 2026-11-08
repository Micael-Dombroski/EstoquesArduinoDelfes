import { Acompanhamento } from "@/features/entradas/acompanhamento";

export default function PedidosPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold">Pedidos e Ordens de Compra (OC)</h1>
      <p className="mb-6 text-slate-600 dark:text-slate-400">
        Acompanhe solicitações de compra, aprove e emita OCs ao fornecedor e consulte prazos e status de entrega em um só
        lugar.
      </p>
      <Acompanhamento />
    </>
  );
}

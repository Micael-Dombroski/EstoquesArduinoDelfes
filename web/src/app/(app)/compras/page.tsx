import { PedidosCompra } from "@/features/compras/pedidos-compra";

export default function ComprasPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold">Solicitações e Pedidos de Compra</h1>
      <p className="mb-6 text-slate-600 dark:text-slate-400">
        O Almoxarifado gera as solicitações de reposição e o Setor de Compras ou o Supervisor revisam e aprovam o envio
        ao fornecedor.
      </p>
      <PedidosCompra />
    </>
  );
}


import { RecebimentoMateriais } from "@/features/recebimento/recebimento-materiais";

export default function RecebimentoPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold">Recebimento de Materiais (OC e NF)</h1>
      <p className="mb-6 text-slate-600 dark:text-slate-400">
        Registre a chegada parcial ou total de materiais pela Ordem de Compra (OC) e vincule a Nota Fiscal (NF) para
        liberar a entrada no estoque.
      </p>
      <RecebimentoMateriais />
    </>
  );
}


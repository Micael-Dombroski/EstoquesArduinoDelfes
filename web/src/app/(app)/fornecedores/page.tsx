import { FornecedoresTela } from "@/features/fornecedores/fornecedores-tela";

export default function FornecedoresPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold">Fornecedores</h1>
      <p className="mb-6 text-slate-600 dark:text-slate-400">
        Consulte os fornecedores, seus produtos, prazos e preços. Somente o Supervisor cadastra, edita e ativa ou desativa.
      </p>
      <FornecedoresTela />
    </>
  );
}
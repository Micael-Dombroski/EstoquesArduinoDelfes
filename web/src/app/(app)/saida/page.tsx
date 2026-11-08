import { Historico } from "@/features/saida/historico";
import { SaidaForm } from "@/features/saida/saida-form";

export default function SaidaPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold">Solicitar e retirar material</h1>
      <p className="mb-6 text-slate-600 dark:text-slate-400">
        Monte a lista de materiais informando o destinatário. O Almoxarifado e o Supervisor conferem as solicitações e
        realizam a baixa no estoque.
      </p>
      <SaidaForm />
      <Historico />
    </>
  );
}

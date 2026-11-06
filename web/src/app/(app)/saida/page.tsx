import { Historico } from "@/features/saida/historico";
import { SaidaForm } from "@/features/saida/saida-form";

export default function SaidaPage() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Retirar material</h1>
      <SaidaForm />
      <Historico />
    </>
  );
}

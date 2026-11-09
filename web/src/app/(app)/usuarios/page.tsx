import { GestaoUsuarios } from "@/features/usuarios/gestao-usuarios";

export default function UsuariosPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold">Gestão de Usuários e Permissões</h1>
      <p className="mb-6 text-slate-600 dark:text-slate-400">
        Cadastre novos usuários, defina níveis de permissão (Solicitante, Almoxarifado, Compras ou Supervisor), vincule
        funcionários e gerencie o status de acesso ao sistema.
      </p>
      <GestaoUsuarios />
    </>
  );
}

/**
 * Papéis e permissões (preparado para evoluir). Usado no servidor (autorização) e na UI (esconder ações).
 * A UI esconder um botão NÃO é segurança: os serviços sempre verificam de novo.
 */
export type Role = "OWNER" | "ADMIN" | "MANAGER" | "EMPLOYEE" | "VIEWER";

const RANK: Record<Role, number> = { VIEWER: 0, EMPLOYEE: 1, MANAGER: 2, ADMIN: 3, OWNER: 4 };

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Proprietário",
  ADMIN: "Administrador",
  MANAGER: "Gerente",
  EMPLOYEE: "Funcionário",
  VIEWER: "Visualizador",
};

export type Permission =
  | "read"
  | "write" // cadastros, compras, vendas, despesas, recebimentos
  | "cancel" // cancelar vendas/compras/despesas, devoluções, ajustes de estoque
  | "approveLoss" // confirmar venda com prejuízo (D4)
  | "manageBusiness"; // configurações da empresa

const MIN_ROLE: Record<Permission, Role> = {
  read: "VIEWER",
  write: "EMPLOYEE",
  cancel: "MANAGER",
  approveLoss: "MANAGER",
  manageBusiness: "ADMIN",
};

export function can(role: Role, permission: Permission): boolean {
  return RANK[role] >= RANK[MIN_ROLE[permission]];
}

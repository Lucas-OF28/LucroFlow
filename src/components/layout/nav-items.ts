import {
  BarChart3,
  Boxes,
  History,
  LayoutDashboard,
  Lightbulb,
  Package,
  Receipt,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
} from "lucide-react";

export const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/produtos", label: "Produtos", icon: Package },
  { href: "/estoque", label: "Estoque", icon: Boxes },
  { href: "/compras", label: "Compras", icon: ShoppingCart },
  { href: "/vendas", label: "Vendas", icon: ShoppingBag },
  { href: "/despesas", label: "Despesas", icon: Receipt },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/fornecedores", label: "Fornecedores", icon: Truck },
  { href: "/financeiro", label: "Financeiro", icon: Wallet },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { href: "/inteligencia", label: "Inteligência", icon: Lightbulb },
  { href: "/historico", label: "Histórico", icon: History },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
] as const;

export const QUICK_ACTIONS = [
  { href: "/vendas/nova", label: "Nova venda", icon: ShoppingBag },
  { href: "/compras/nova", label: "Nova compra", icon: ShoppingCart },
  { href: "/produtos/novo", label: "Novo produto", icon: Package },
  { href: "/despesas?nova=1", label: "Nova despesa", icon: Receipt },
] as const;


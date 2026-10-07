import {
  Archive,
  ChefHat,
  ClipboardList,
  DollarSign,
  FileDown,
  FileText,
  LayoutDashboard,
  LayoutGrid,
  Package,
  QrCode,
  Settings,
  ShoppingBag,
  ShoppingCart,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  permission: string;
  implemented: boolean;
}

// Mesmo catálogo de 16 telas/26 permissões já definido no backend
// (ver supabase/migrations/..._extensions_and_enums.sql, enum permission_key).
// `implemented` controla se a tela já é real ou mostra "em construção".
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard, permission: "dashboard.view", implemented: true },
  { label: "PDV", path: "/pdv", icon: ShoppingCart, permission: "pdv.view", implemented: true },
  { label: "Mesas", path: "/tables", icon: LayoutGrid, permission: "tables.view", implemented: false },
  { label: "Vendas", path: "/sales-history", icon: ClipboardList, permission: "sales.view", implemented: false },
  { label: "Ingredientes", path: "/ingredients", icon: Package, permission: "ingredients.view", implemented: false },
  { label: "Estoque", path: "/stock", icon: Archive, permission: "stock.view", implemented: true },
  { label: "Cardápio", path: "/menu", icon: ChefHat, permission: "menu.view", implemented: false },
  { label: "Fichas Técnicas", path: "/recipes", icon: FileText, permission: "recipes.view", implemented: false },
  { label: "Financeiro", path: "/financial", icon: DollarSign, permission: "financial.view", implemented: true },
  { label: "Análise de Lucro", path: "/profit-analysis", icon: TrendingUp, permission: "profit.view", implemented: false },
  { label: "DRE", path: "/dre", icon: FileText, permission: "dre.view", implemented: false },
  { label: "Relatórios", path: "/reports", icon: FileDown, permission: "reports.view", implemented: false },
  { label: "Cardápio Digital", path: "/digital-menu", icon: QrCode, permission: "digital_menu.view", implemented: false },
  { label: "Pedidos Online", path: "/online-orders", icon: ShoppingBag, permission: "online_orders.view", implemented: true },
  { label: "Configurações", path: "/settings", icon: Settings, permission: "settings.view", implemented: false },
  { label: "Equipe", path: "/team", icon: Users, permission: "team.manage", implemented: false },
];

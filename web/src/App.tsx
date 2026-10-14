import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AdminAccounts } from "./admin/AdminAccounts";
import { AdminAi } from "./admin/AdminAi";
import { AdminCrm } from "./admin/AdminCrm";
import { AdminEvents } from "./admin/AdminEvents";
import { AdminForms } from "./admin/AdminForms";
import { AdminLayout } from "./admin/AdminLayout";
import { AdminMarketing } from "./admin/AdminMarketing";
import { AdminOverview } from "./admin/AdminOverview";
import { AdminPlans } from "./admin/AdminPlans";
import { AdminTasks } from "./admin/AdminTasks";
import { ComingSoon } from "./components/ComingSoon";
import { AccessBlocked } from "./components/AccessBlocked";
import { Layout } from "./components/Layout";
import { NAV_ITEMS } from "./components/navItems";
import { AuthProvider, useAuth } from "./lib/auth";
import { Dashboard } from "./pages/Dashboard";
import { DigitalMenu } from "./pages/DigitalMenu";
import { Dre } from "./pages/Dre";
import { Financial } from "./pages/Financial";
import { Ingredients } from "./pages/Ingredients";
import { Login } from "./pages/Login";
import { Menu } from "./pages/Menu";
import { OnlineOrders } from "./pages/OnlineOrders";
import { Pdv } from "./pages/Pdv";
import { ProfitAnalysis } from "./pages/ProfitAnalysis";
import { PublicMenu } from "./pages/PublicMenu";
import { Recipes } from "./pages/Recipes";
import { Reports } from "./pages/Reports";
import { SalesHistory } from "./pages/SalesHistory";
import { Settings } from "./pages/Settings";
import { Stock } from "./pages/Stock";
import { Tables } from "./pages/Tables";
import { Team } from "./pages/Team";

const IMPLEMENTED: Record<string, React.ComponentType> = {
  "/": Dashboard,
  "/pdv": Pdv,
  "/tables": Tables,
  "/sales-history": SalesHistory,
  "/ingredients": Ingredients,
  "/stock": Stock,
  "/menu": Menu,
  "/recipes": Recipes,
  "/financial": Financial,
  "/profit-analysis": ProfitAnalysis,
  "/dre": Dre,
  "/reports": Reports,
  "/digital-menu": DigitalMenu,
  "/online-orders": OnlineOrders,
  "/settings": Settings,
  "/team": Team,
};

function Gate() {
  const { loading, session, can, isAdmin, access, freshLogin, clearFreshLogin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Admin da plataforma que acabou de entrar pela tela de login vai direto pro
  // painel — a menos que tenha aberto um link específico (ex.: /app/admin/crm).
  useEffect(() => {
    if (loading || !session || !freshLogin) return;
    clearFreshLogin();
    if (isAdmin && location.pathname === "/") navigate("/admin", { replace: true });
  }, [loading, session, freshLogin, isAdmin, location.pathname, navigate, clearFreshLogin]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted">Carregando...</div>;
  }

  if (!session) {
    return <Login />;
  }

  // Assinatura vencida/cancelada: nenhuma tela do sistema, só o aviso.
  // (access null = consulta falhou; não tranca ninguém por erro de rede.)
  if (!isAdmin && access && !access.allowed) {
    return <AccessBlocked />;
  }

  // Primeira tela que o usuário pode ver — membro de equipe sem dashboard.view
  // não deve cair numa tela que a RLS vai devolver vazia.
  const home = NAV_ITEMS.find((item) => can(item.permission))?.path ?? "/";

  return (
    <Routes>
      {/* Painel da equipe Blyn: só existe na árvore de rotas pra admin da
          plataforma (a RLS bloqueia os dados de qualquer forma). */}
      {isAdmin && (
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminOverview />} />
          <Route path="crm" element={<AdminCrm />} />
          <Route path="tasks" element={<AdminTasks />} />
          <Route path="marketing" element={<AdminMarketing />} />
          <Route path="accounts" element={<AdminAccounts />} />
          <Route path="plans" element={<AdminPlans />} />
          <Route path="ai" element={<AdminAi />} />
          <Route path="forms" element={<AdminForms />} />
          <Route path="events" element={<AdminEvents />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Route>
      )}
      <Route element={<Layout />}>
        {NAV_ITEMS.filter((item) => can(item.permission)).map((item) => {
          const Component = IMPLEMENTED[item.path] ?? (() => <ComingSoon title={item.label} />);
          return <Route key={item.path} path={item.path} element={<Component />} />;
        })}
        <Route path="*" element={<Navigate to={home} replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Cardápio público: acessível sem login, é o destino do QR Code. */}
        <Route path="/cardapio/:slug" element={<PublicMenu />} />
        <Route path="*" element={<Gate />} />
      </Routes>
    </AuthProvider>
  );
}

import { Navigate, Route, Routes } from "react-router-dom";
import { ComingSoon } from "./components/ComingSoon";
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
  const { loading, session, can } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted">Carregando...</div>;
  }

  if (!session) {
    return <Login />;
  }

  // Primeira tela que o usuário pode ver — membro de equipe sem dashboard.view
  // não deve cair numa tela que a RLS vai devolver vazia.
  const home = NAV_ITEMS.find((item) => can(item.permission))?.path ?? "/";

  return (
    <Routes>
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

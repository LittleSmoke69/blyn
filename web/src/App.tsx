import { Navigate, Route, Routes } from "react-router-dom";
import { ComingSoon } from "./components/ComingSoon";
import { Layout } from "./components/Layout";
import { NAV_ITEMS } from "./components/navItems";
import { AuthProvider, useAuth } from "./lib/auth";
import { Dashboard } from "./pages/Dashboard";
import { Financial } from "./pages/Financial";
import { Login } from "./pages/Login";
import { OnlineOrders } from "./pages/OnlineOrders";
import { Pdv } from "./pages/Pdv";
import { Stock } from "./pages/Stock";

const IMPLEMENTED: Record<string, React.ComponentType> = {
  "/": Dashboard,
  "/pdv": Pdv,
  "/stock": Stock,
  "/financial": Financial,
  "/online-orders": OnlineOrders,
};

function Gate() {
  const { loading, session } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted">Carregando...</div>;
  }

  if (!session) {
    return <Login />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        {NAV_ITEMS.map((item) => {
          const Component = IMPLEMENTED[item.path] ?? (() => <ComingSoon title={item.label} />);
          return <Route key={item.path} path={item.path} element={<Component />} />;
        })}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}

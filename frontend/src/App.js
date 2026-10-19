import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { can } from "@/lib/api";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Saida from "@/pages/Saida";
import Entrada from "@/pages/Entrada";
import Lotes from "@/pages/Lotes";
import Devolucao from "@/pages/Devolucao";
import Solicitacoes from "@/pages/Solicitacoes";
import Compras from "@/pages/Compras";
import Produtos from "@/pages/Produtos";
import Auditoria from "@/pages/Auditoria";
import Admin from "@/pages/Admin";

const Guard = ({ perm, children }) => {
  const { user } = useAuth();
  if (perm && !can(user, perm)) return <Navigate to="/solicitacoes" replace />;
  return children;
};

const Protected = () => {
  const { user } = useAuth();
  if (user === null) return <div className="flex h-screen items-center justify-center text-slate-400">Carregando…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout />;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster richColors position="top-right" />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Protected />}>
            <Route path="/" element={<Guard perm="ver_estoque"><Dashboard /></Guard>} />
            <Route path="/saida" element={<Guard perm="saida"><Saida /></Guard>} />
            <Route path="/entrada" element={<Guard perm="entrada"><Entrada /></Guard>} />
            <Route path="/lotes" element={<Guard perm="ver_estoque"><Lotes /></Guard>} />
            <Route path="/devolucao" element={<Guard perm="devolucao"><Devolucao /></Guard>} />
            <Route path="/solicitacoes" element={<Solicitacoes />} />
            <Route path="/compras" element={<Guard perm="compra_ver"><Compras /></Guard>} />
            <Route path="/produtos" element={<Guard perm="ver_estoque"><Produtos /></Guard>} />
            <Route path="/auditoria" element={<Guard perm="auditoria"><Auditoria /></Guard>} />
            <Route path="/admin" element={<Guard perm="admin"><Admin /></Guard>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;

import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, PackageMinus, PackagePlus, ClipboardList, RotateCcw, ShoppingCart, ShieldCheck, Boxes, Layers, Settings, LogOut, Menu, X, Cross } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { can, ROLES } from "@/lib/api";

const NAV = [
  { id: "dashboard", to: "/", label: "Painel", icon: LayoutDashboard, perm: "ver_estoque" },
  { id: "saida", to: "/saida", label: "Saída (Setor/Leito)", icon: PackageMinus, perm: "saida" },
  { id: "solicitacoes", to: "/solicitacoes", label: "Solicitações", icon: ClipboardList, perm: null },
  { id: "entrada", to: "/entrada", label: "Entrada", icon: PackagePlus, perm: "entrada" },
  { id: "lotes", to: "/lotes", label: "Lotes & FEFO", icon: Layers, perm: "ver_estoque" },
  { id: "devolucao", to: "/devolucao", label: "Devolução", icon: RotateCcw, perm: "devolucao" },
  { id: "compras", to: "/compras", label: "Compras", icon: ShoppingCart, perm: "compra_ver" },
  { id: "produtos", to: "/produtos", label: "Produtos", icon: Boxes, perm: "ver_estoque" },
  { id: "auditoria", to: "/auditoria", label: "Auditoria", icon: ShieldCheck, perm: "auditoria" },
  { id: "admin", to: "/admin", label: "Administração", icon: Settings, perm: "admin" },
];

const NavItems = ({ user, onClick }) =>
  NAV.filter((n) => !n.perm || can(user, n.perm)).map((n) => (
    <NavLink
      key={n.id}
      to={n.to}
      end={n.to === "/"}
      onClick={onClick}
      data-testid={`nav-item-${n.id}`}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          isActive ? "bg-sky-600 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"
        }`
      }
    >
      <n.icon className="h-4 w-4" />
      {n.label}
    </NavLink>
  ));

export default function Layout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const sidebar = (
    <div className="flex h-full flex-col bg-slate-900 p-4">
      <div className="mb-8 flex items-center gap-2 px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500"><Cross className="h-5 w-5 text-white" /></div>
        <div>
          <div className="font-display text-lg font-bold leading-none text-white">SGEH</div>
          <div className="text-[11px] uppercase tracking-wider text-slate-400">Estoque Hospitalar</div>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        <NavItems user={user} onClick={() => setOpen(false)} />
      </nav>
      <div className="mt-4 rounded-lg bg-slate-800 p-3">
        <div data-testid="current-user-name" className="truncate text-sm font-semibold text-white">{user.nome}</div>
        <div data-testid="current-user-role" className="truncate text-xs text-sky-300">{ROLES[user.role]}</div>
        <button data-testid="logout-button" onClick={logout} className="mt-3 flex items-center gap-2 text-xs text-slate-400 transition-colors hover:text-white">
          <LogOut className="h-3.5 w-3.5" /> Sair
        </button>
      </div>
    </div>
  );
  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 hidden w-60 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64">{sidebar}</div>
        </div>
      )}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
        <span className="font-display font-bold text-slate-900">SGEH</span>
        <button data-testid="mobile-menu-button" onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
      </header>
      <main className="px-4 py-6 sm:px-8 lg:ml-60 lg:py-8">
        <Outlet />
      </main>
    </div>
  );
}

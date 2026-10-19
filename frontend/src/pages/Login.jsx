import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Cross, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { errMsg, can } from "@/lib/api";

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={can(user, "ver_estoque") ? "/" : "/solicitacoes"} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const u = await login(email, password);
      nav(can(u, "ver_estoque") ? "/" : "/solicitacoes");
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-slate-900 lg:block">
        <img src="https://images.pexels.com/photos/9629685/pexels-photo-9629685.jpeg?auto=compress&cs=tinysrgb&w=1200" alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
        <div className="relative flex h-full flex-col justify-end p-12 text-white">
          <h2 className="font-display text-4xl font-bold leading-tight">Rastreabilidade do almoxarifado<br />até o leito.</h2>
          <p className="mt-4 max-w-md text-slate-300">Entradas, saídas por FEFO, devoluções, compras e auditoria completa para hospital público.</p>
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm fade-up" data-testid="login-form">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500"><Cross className="text-white" /></div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">SGEH</h1>
              <p className="text-sm text-slate-500">Sistema de Gestão de Estoque Hospitalar</p>
            </div>
          </div>
          <label className="lbl">E-mail</label>
          <input data-testid="login-email-input" className="field mb-4" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <label className="lbl">Senha</label>
          <input data-testid="login-password-input" className="field mb-4" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && <div data-testid="login-error" className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
          <button data-testid="login-submit-button" disabled={busy} className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-sky-600 font-semibold text-white transition-colors hover:bg-sky-700 disabled:opacity-60">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Entrar
          </button>
          <p className="mt-6 text-xs text-slate-400">Acesso restrito a usuários cadastrados pelo administrador.</p>
        </form>
      </div>
    </div>
  );
}

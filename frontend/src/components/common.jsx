import { useEffect, useState, useCallback } from "react";
import { api, errMsg } from "@/lib/api";
import { toast } from "sonner";

const SIT = {
  vencido: ["Vencido", "bg-rose-100 text-rose-800 border-rose-300"],
  risco_30: ["≤ 30 dias", "bg-amber-100 text-amber-800 border-amber-300"],
  risco_60: ["31–60 dias", "bg-yellow-50 text-yellow-800 border-yellow-300"],
  risco_90: ["61–90 dias", "bg-blue-100 text-blue-800 border-blue-300"],
  bloqueado: ["Bloqueado", "bg-slate-200 text-slate-700 border-slate-400"],
  ok: ["Regular", "bg-emerald-100 text-emerald-800 border-emerald-300"],
};

export const SituacaoBadge = ({ s, testId }) => {
  const [label, cls] = SIT[s] || [s, "bg-slate-100 text-slate-700 border-slate-300"];
  return (
    <span data-testid={testId} className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  );
};

const ST = {
  pendente: "bg-amber-100 text-amber-800 border-amber-300",
  aprovada: "bg-sky-100 text-sky-800 border-sky-300",
  aprovado: "bg-sky-100 text-sky-800 border-sky-300",
  atendida: "bg-emerald-100 text-emerald-800 border-emerald-300",
  recebido: "bg-emerald-100 text-emerald-800 border-emerald-300",
  rejeitada: "bg-rose-100 text-rose-800 border-rose-300",
  rejeitado: "bg-rose-100 text-rose-800 border-rose-300",
  cancelada: "bg-slate-100 text-slate-600 border-slate-300",
  entrada: "bg-emerald-100 text-emerald-800 border-emerald-300",
  saida: "bg-sky-100 text-sky-800 border-sky-300",
  devolucao: "bg-violet-50 text-indigo-800 border-indigo-200",
  perda: "bg-rose-100 text-rose-800 border-rose-300",
};

export const StatusPill = ({ s, testId }) => (
  <span data-testid={testId} className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${ST[s] || "bg-slate-100 text-slate-600 border-slate-300"}`}>
    {s === "saida" ? "saída" : s === "devolucao" ? "devolução" : s}
  </span>
);

export const PageHeader = ({ title, subtitle, children }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-4 fade-up">
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
    </div>
    <div className="flex flex-wrap gap-2">{children}</div>
  </div>
);

export const Empty = ({ text = "Nenhum registro encontrado." }) => (
  <div className="py-10 text-center text-sm text-slate-400">{text}</div>
);

export function useFetch(url, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    try {
      const r = await api.get(url);
      setData(r.data);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);
  useEffect(() => {
    load();
  }, [load]);
  return { data, loading, reload: load, setData };
}

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Lock, Unlock, Trash2, Zap } from "lucide-react";
import { api, errMsg, num, dateBR, brl, can } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useFetch, PageHeader, SituacaoBadge, Empty } from "@/components/common";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const FILTROS = [["", "Todos"], ["risco", "Em risco (≤ 90 dias)"], ["vencido", "Vencidos"], ["bloqueado", "Bloqueados"]];

const AcaoDialog = ({ acao, onClose, onDone }) => {
  const [motivo, setMotivo] = useState("");
  const [qtd, setQtd] = useState("");
  if (!acao) return null;
  const { tipo, lote } = acao;
  const titulo = tipo === "baixa" ? "Baixa por perda / descarte" : tipo === "bloquear" ? "Bloquear lote" : "Liberar lote";
  const submit = async (e) => {
    e.preventDefault();
    try {
      if (tipo === "baixa") await api.post(`/lotes/${lote.id}/baixa`, { quantidade: parseFloat(qtd), motivo });
      else await api.post(`/lotes/${lote.id}/status`, { status: tipo === "bloquear" ? "bloqueado" : "liberado", motivo });
      toast.success(`${titulo}: lote ${lote.numero}`);
      onDone();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent data-testid="lote-acao-dialog">
        <DialogHeader><DialogTitle>{titulo}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-slate-600">{lote.produto_descricao} · lote <span className="font-mono">{lote.numero}</span> · saldo {num(lote.quantidade)} {lote.unidade}</p>
          {tipo === "baixa" && (
            <div><label className="lbl">Quantidade</label><input data-testid="baixa-quantidade-input" className="field font-mono" type="number" step="any" min="0.01" max={lote.quantidade} value={qtd} onChange={(e) => setQtd(e.target.value)} required /></div>
          )}
          <div>
            <label className="lbl">Motivo</label>
            <input data-testid="lote-acao-motivo-input" className="field" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={tipo === "baixa" ? "Vencimento, avaria, quebra…" : "Justificativa"} required />
          </div>
          <button data-testid="lote-acao-confirmar-button" className="h-10 w-full rounded-md bg-sky-600 font-semibold text-white hover:bg-sky-700">Confirmar</button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default function Lotes() {
  const { user } = useAuth();
  const { data, reload } = useFetch("/lotes");
  const [filtro, setFiltro] = useState("");
  const [busca, setBusca] = useState("");
  const [acao, setAcao] = useState(null);

  const lista = useMemo(() => (data || []).filter((l) => {
    if (filtro === "risco" && !["risco_30", "risco_60", "risco_90"].includes(l.situacao)) return false;
    if (filtro && filtro !== "risco" && l.situacao !== filtro) return false;
    const b = busca.toLowerCase();
    return !b || l.produto_descricao?.toLowerCase().includes(b) || l.numero.toLowerCase().includes(b);
  }), [data, filtro, busca]);
  const total = lista.reduce((s, l) => s + l.valor, 0);

  return (
    <div>
      <PageHeader title="Lotes & FEFO" subtitle="Lotes ordenados pela menor validade. O primeiro lote elegível de cada produto é o próximo a sair." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTROS.map(([k, l]) => (
          <button key={k} data-testid={`filtro-lotes-${k || "todos"}`} onClick={() => setFiltro(k)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${filtro === k ? "border-sky-600 bg-sky-600 text-white" : "border-slate-300 bg-white text-slate-600 hover:border-sky-400"}`}>{l}</button>
        ))}
        <input data-testid="busca-lotes-input" className="field ml-auto max-w-xs" placeholder="Buscar produto ou lote…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      <div className="card overflow-hidden">
        <div className="flex justify-between border-b border-slate-100 px-5 py-3 text-sm">
          <span className="text-slate-500">{lista.length} lote(s)</span>
          <span>Valor total filtrado: <span data-testid="lotes-valor-filtrado" className="font-mono font-semibold">{brl(total)}</span></span>
        </div>
        <div className="overflow-auto">
          <table className="tbl" data-testid="table-lotes-fefo">
            <thead><tr><th>Produto</th><th>Lote</th><th>Validade</th><th>Dias</th><th>Situação</th><th className="text-right">Saldo</th><th className="text-right">Valor</th><th></th></tr></thead>
            <tbody>
              {lista.map((l) => (
                <tr key={l.id} data-testid={`lote-row-${l.numero}`}>
                  <td><div className="font-medium">{l.produto_descricao}</div><div className="font-mono text-[11px] text-slate-400">{l.produto_codigo}</div></td>
                  <td className="font-mono text-xs">
                    {l.numero}
                    {l.fefo_proximo && <span className="ml-2 inline-flex items-center gap-0.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800"><Zap className="h-3 w-3" />FEFO</span>}
                  </td>
                  <td className="font-mono text-xs">{dateBR(l.validade)}</td>
                  <td className={`font-mono text-xs ${l.dias_para_vencer < 0 ? "text-rose-700" : ""}`}>{l.dias_para_vencer}</td>
                  <td><SituacaoBadge s={l.situacao} /></td>
                  <td className="text-right font-mono">{num(l.quantidade)} {l.unidade}</td>
                  <td className="text-right font-mono font-semibold">{brl(l.valor)}</td>
                  <td className="whitespace-nowrap text-right">
                    {can(user, "lote_status") && (l.status === "liberado"
                      ? <button title="Bloquear" data-testid={`bloquear-lote-${l.numero}`} onClick={() => setAcao({ tipo: "bloquear", lote: l })} className="rounded p-1.5 text-slate-500 hover:bg-slate-100"><Lock className="h-4 w-4" /></button>
                      : <button title="Liberar" data-testid={`liberar-lote-${l.numero}`} onClick={() => setAcao({ tipo: "liberar", lote: l })} className="rounded p-1.5 text-emerald-600 hover:bg-emerald-50"><Unlock className="h-4 w-4" /></button>)}
                    {can(user, "baixa") && <button title="Baixa por perda" data-testid={`baixa-lote-${l.numero}`} onClick={() => setAcao({ tipo: "baixa", lote: l })} className="rounded p-1.5 text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && !lista.length && <Empty />}
        </div>
      </div>
      <AcaoDialog key={acao ? `${acao.tipo}-${acao.lote.id}` : "none"} acao={acao} onClose={() => setAcao(null)} onDone={() => { setAcao(null); reload(); }} />
    </div>
  );
}

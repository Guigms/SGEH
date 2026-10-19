import { useMemo, useState } from "react";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { api, errMsg, num, dateTimeBR, brl } from "@/lib/api";
import { useFetch, PageHeader, Empty, StatusPill } from "@/components/common";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const DevDialog = ({ mov, onClose, onDone }) => {
  const [f, setF] = useState({ quantidade: "", condicao: "integro", motivo: "" });
  const restante = mov.quantidade - (mov.devolvido || 0);
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post("/devolucoes", { movimento_id: mov.id, ...f, quantidade: parseFloat(f.quantidade) });
      toast.success(f.condicao === "integro" ? "Devolução registrada: material retornou ao lote original" : "Devolução registrada como perda/descarte");
      onDone();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent data-testid="devolucao-dialog">
        <DialogHeader><DialogTitle>Devolver material</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="rounded-lg bg-slate-50 p-3 text-sm">
            <div className="font-medium">{mov.produto_descricao}</div>
            <div className="font-mono text-xs text-slate-500">Lote {mov.lote_numero} · {mov.setor_nome} {mov.leito_codigo && `· Leito ${mov.leito_codigo}`} · devolvível {num(restante)}</div>
          </div>
          <div><label className="lbl">Quantidade</label><input data-testid="devolucao-quantidade-input" className="field font-mono" type="number" step="any" min="0.01" max={restante} value={f.quantidade} onChange={(e) => setF({ ...f, quantidade: e.target.value })} required /></div>
          <div>
            <label className="lbl">Condição do material</label>
            <select data-testid="devolucao-condicao-select" className="field" value={f.condicao} onChange={(e) => setF({ ...f, condicao: e.target.value })}>
              <option value="integro">Íntegro (lacrado, conservado) — volta ao estoque</option>
              <option value="avariado">Avariado / sem garantia de conservação — descarte</option>
            </select>
          </div>
          <div><label className="lbl">Motivo</label><input data-testid="devolucao-motivo-input" className="field" placeholder="Prescrição cancelada, sobra íntegra, erro de separação…" value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} required /></div>
          <button data-testid="devolucao-confirmar-button" className="h-10 w-full rounded-md bg-sky-600 font-semibold text-white hover:bg-sky-700">Confirmar devolução</button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default function Devolucao() {
  const saidas = useFetch("/movimentos?tipo=saida&limit=300");
  const devs = useFetch("/movimentos?limit=300");
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState(null);

  const lista = useMemo(() => (saidas.data || []).filter((m) => m.quantidade - (m.devolvido || 0) > 0).filter((m) => {
    const b = busca.toLowerCase();
    return !b || [m.produto_descricao, m.lote_numero, m.setor_nome, m.leito_codigo, m.id].some((x) => x && x.toLowerCase().includes(b));
  }), [saidas.data, busca]);
  const historico = (devs.data || []).filter((m) => m.ref_id && (m.tipo === "devolucao" || m.tipo === "perda")).slice(0, 10);

  return (
    <div>
      <PageHeader title="Devolução de Material" subtitle="Toda devolução referencia a saída original (lote, setor e leito)." />
      <input data-testid="devolucao-busca-input" className="field mb-4 max-w-md" placeholder="Buscar por produto, lote, setor ou leito…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      <div className="card overflow-hidden">
        <div className="max-h-[480px] overflow-auto">
          <table className="tbl" data-testid="table-saidas-devolviveis">
            <thead><tr><th>Data</th><th>Produto</th><th>Lote</th><th>Setor / Leito</th><th className="text-right">Saída</th><th className="text-right">Devolvido</th><th></th></tr></thead>
            <tbody>
              {lista.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap font-mono text-xs">{dateTimeBR(m.created_at)}</td>
                  <td>{m.produto_descricao}</td>
                  <td className="font-mono text-xs">{m.lote_numero}</td>
                  <td className="text-xs">{m.setor_nome}{m.leito_codigo && <span className="ml-1 rounded bg-sky-100 px-1.5 py-0.5 font-mono text-sky-800">{m.leito_codigo}</span>}</td>
                  <td className="text-right font-mono">{num(m.quantidade)}</td>
                  <td className="text-right font-mono">{num(m.devolvido || 0)}</td>
                  <td className="text-right">
                    <button data-testid={`devolver-${m.id}`} onClick={() => setSel(m)} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-sky-500 hover:text-sky-700"><RotateCcw className="h-3 w-3" />Devolver</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {saidas.data && !lista.length && <Empty />}
        </div>
      </div>
      <h3 className="mb-3 mt-8 font-semibold text-slate-800">Devoluções recentes</h3>
      <div className="card overflow-hidden">
        <table className="tbl" data-testid="table-devolucoes-recentes">
          <thead><tr><th>Data</th><th>Tipo</th><th>Produto</th><th>Lote</th><th>Origem</th><th className="text-right">Qtd</th><th className="text-right">Valor</th><th>Motivo</th></tr></thead>
          <tbody>
            {historico.map((m) => (
              <tr key={m.id}>
                <td className="whitespace-nowrap font-mono text-xs">{dateTimeBR(m.created_at)}</td>
                <td><StatusPill s={m.tipo} /></td>
                <td>{m.produto_descricao}</td>
                <td className="font-mono text-xs">{m.lote_numero}</td>
                <td className="text-xs">{m.setor_nome} {m.leito_codigo}</td>
                <td className="text-right font-mono">{num(m.quantidade)}</td>
                <td className="text-right font-mono">{brl(m.valor)}</td>
                <td className="text-xs text-slate-500">{m.motivo}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {devs.data && !historico.length && <Empty text="Nenhuma devolução registrada." />}
      </div>
      {sel && <DevDialog mov={sel} onClose={() => setSel(null)} onDone={() => { setSel(null); saidas.reload(); devs.reload(); }} />}
    </div>
  );
}

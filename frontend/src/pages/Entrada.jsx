import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { api, errMsg, num, dateBR, dateTimeBR, brl } from "@/lib/api";
import { useFetch, PageHeader, Empty } from "@/components/common";

const EMPTY = { produto_id: "", lote_numero: "", validade: "", quantidade: "", custo_unitario: "", fornecedor: "", nota_fiscal: "" };

export default function Entrada() {
  const { data: produtos, reload } = useFetch("/produtos");
  const recentes = useFetch("/movimentos?tipo=entrada&limit=15");
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const produto = produtos?.find((p) => p.id === f.produto_id);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/entradas", { ...f, quantidade: parseFloat(f.quantidade), custo_unitario: parseFloat(f.custo_unitario) });
      toast.success(`Entrada registrada: lote ${f.lote_numero}`);
      setF({ ...EMPTY, fornecedor: f.fornecedor, nota_fiscal: f.nota_fiscal });
      recentes.reload();
      reload();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Entrada de Material" subtitle="Registro de lote, validade e custo. O custo médio ponderado é recalculado a cada entrada." />
      <div className="grid gap-6 xl:grid-cols-5">
        <form onSubmit={submit} className="card space-y-4 p-6 xl:col-span-2" data-testid="entrada-form">
          <div>
            <label className="lbl">Produto</label>
            <select data-testid="entrada-produto-select" className="field" value={f.produto_id} onChange={set("produto_id")} required>
              <option value="">Selecione…</option>
              {(produtos || []).filter((p) => p.ativo).map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.descricao}</option>)}
            </select>
            {produto && <p className="mt-1 font-mono text-xs text-slate-500">Saldo atual {num(produto.saldo_fisico)} {produto.unidade} · custo médio {brl(produto.custo_medio)}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="lbl">Nº do lote</label><input data-testid="entrada-lote-input" className="field font-mono" value={f.lote_numero} onChange={set("lote_numero")} required /></div>
            <div><label className="lbl">Validade</label><input data-testid="entrada-validade-input" className="field font-mono" type="date" value={f.validade} onChange={set("validade")} required /></div>
            <div><label className="lbl">Quantidade</label><input data-testid="entrada-quantidade-input" className="field font-mono" type="number" min="0.01" step="any" value={f.quantidade} onChange={set("quantidade")} required /></div>
            <div><label className="lbl">Custo unitário (R$)</label><input data-testid="entrada-custo-input" className="field font-mono" type="number" min="0" step="0.01" value={f.custo_unitario} onChange={set("custo_unitario")} required /></div>
            <div><label className="lbl">Fornecedor</label><input data-testid="entrada-fornecedor-input" className="field" value={f.fornecedor} onChange={set("fornecedor")} /></div>
            <div><label className="lbl">Nota fiscal</label><input data-testid="entrada-nf-input" className="field font-mono" value={f.nota_fiscal} onChange={set("nota_fiscal")} /></div>
          </div>
          {f.quantidade && f.custo_unitario && (
            <div className="rounded-lg bg-slate-50 p-3 text-sm">Valor da entrada: <span className="font-mono font-semibold">{brl(parseFloat(f.quantidade) * parseFloat(f.custo_unitario))}</span></div>
          )}
          <button data-testid="entrada-salvar-button" disabled={busy} className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-emerald-600 font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Registrar entrada
          </button>
        </form>
        <div className="card overflow-hidden xl:col-span-3">
          <h3 className="p-5 pb-3 font-semibold text-slate-800">Últimas entradas</h3>
          <div className="overflow-auto">
            <table className="tbl" data-testid="table-entradas-recentes">
              <thead><tr><th>Data</th><th>Produto</th><th>Lote</th><th>Validade</th><th className="text-right">Qtd</th><th className="text-right">Valor</th><th>Doc.</th></tr></thead>
              <tbody>
                {(recentes.data || []).map((m) => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap font-mono text-xs">{dateTimeBR(m.created_at)}</td>
                    <td>{m.produto_descricao}</td>
                    <td className="font-mono text-xs">{m.lote_numero}</td>
                    <td className="font-mono text-xs">{dateBR(m.validade)}</td>
                    <td className="text-right font-mono">{num(m.quantidade)}</td>
                    <td className="text-right font-mono">{brl(m.valor)}</td>
                    <td className="text-xs text-slate-500">{m.documento}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {recentes.data && !recentes.data.length && <Empty />}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Zap, BedDouble } from "lucide-react";
import { api, errMsg, num, dateBR, dateTimeBR, brl, ASSISTENCIAIS, CATEGORIAS } from "@/lib/api";
import { useFetch, PageHeader, Empty } from "@/components/common";

const FefoPreview = ({ fefo }) => {
  if (!fefo) return null;
  return (
    <div data-testid="saida-lote-fefo-sugerido" className={`rounded-lg border p-4 ${fefo.suficiente ? "border-emerald-300 bg-emerald-50" : "border-rose-300 bg-rose-50"}`}>
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
        <Zap className="h-4 w-4 text-emerald-600" /> Lotes sugeridos por FEFO
        <span className="ml-auto font-mono text-xs text-slate-500">Disponível: {num(fefo.disponivel)} {fefo.produto.unidade}</span>
      </div>
      {fefo.suficiente ? (
        <ul className="space-y-1 text-sm">
          {fefo.alocacao.map((a) => (
            <li key={a.lote_id} className="flex justify-between font-mono text-xs">
              <span>Lote {a.lote_numero} · val. {dateBR(a.validade)} ({a.dias_para_vencer} dias)</span>
              <span className="font-semibold">{num(a.quantidade)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-rose-700">Saldo insuficiente em lotes liberados e dentro da validade.</p>
      )}
    </div>
  );
};

export default function Saida() {
  const { data: setores } = useFetch("/setores");
  const { data: produtos } = useFetch("/produtos");
  const recentes = useFetch("/movimentos?tipo=saida&limit=15");
  const [f, setF] = useState({ setor_id: "", leito_id: "", produto_id: "", quantidade: "", motivo: "" });
  const [leitos, setLeitos] = useState([]);
  const [fefo, setFefo] = useState(null);
  const [busy, setBusy] = useState(false);

  const setor = setores?.find((s) => s.id === f.setor_id);
  const produto = produtos?.find((p) => p.id === f.produto_id);
  const prodsPermitidos = useMemo(() => (produtos || []).filter((p) => p.ativo && (!setor || setor.categorias_permitidas.includes(p.categoria))), [produtos, setor]);
  const leitoObrigatorio = setor?.tipo === "assistencial" && produto && ASSISTENCIAIS.includes(produto.categoria);

  useEffect(() => {
    setLeitos([]);
    if (f.setor_id) api.get(`/leitos?setor_id=${f.setor_id}`).then((r) => setLeitos(r.data.filter((l) => l.ativo)));
  }, [f.setor_id]);

  useEffect(() => {
    setFefo(null);
    const q = parseFloat(f.quantidade);
    if (!f.produto_id || !q) return;
    const t = setTimeout(() => api.get(`/fefo/${f.produto_id}?quantidade=${q}`).then((r) => setFefo(r.data)), 250);
    return () => clearTimeout(t);
  }, [f.produto_id, f.quantidade]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/saidas", { ...f, quantidade: parseFloat(f.quantidade), leito_id: f.leito_id || null });
      toast.success(`Saída registrada · FEFO: ${data.map((m) => `lote ${m.lote_numero}`).join(", ")}`);
      setF({ ...f, produto_id: "", quantidade: "", motivo: "" });
      recentes.reload();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Saída de Material" subtitle="Dispensação por setor e leito com seleção automática de lote (FEFO)" />
      <div className="grid gap-6 xl:grid-cols-5">
        <form onSubmit={submit} className="card space-y-4 p-6 xl:col-span-2" data-testid="saida-form">
          <div>
            <label className="lbl">Setor de destino</label>
            <select data-testid="saida-setor-select" className="field" value={f.setor_id} onChange={(e) => setF({ ...f, setor_id: e.target.value, leito_id: "", produto_id: "" })} required>
              <option value="">Selecione…</option>
              {(setores || []).filter((s) => s.ativo && s.tipo !== "estoque").map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="lbl">Produto</label>
            <select data-testid="saida-produto-select" className="field" value={f.produto_id} onChange={(e) => setF({ ...f, produto_id: e.target.value })} required disabled={!f.setor_id}>
              <option value="">Selecione…</option>
              {prodsPermitidos.map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.descricao} (disp. {num(p.saldo_disponivel)})</option>)}
            </select>
            {setor && <p className="mt-1 text-xs text-slate-400">Categorias permitidas: {setor.categorias_permitidas.map((c) => CATEGORIAS[c]).join(", ")}</p>}
          </div>
          <div>
            <label className="lbl flex items-center gap-1"><BedDouble className="h-3.5 w-3.5" /> Leito {leitoObrigatorio ? <span className="text-rose-600">(obrigatório)</span> : "(opcional)"}</label>
            <select data-testid="saida-leito-select" className="field" value={f.leito_id} onChange={(e) => setF({ ...f, leito_id: e.target.value })} required={leitoObrigatorio} disabled={!leitos.length}>
              <option value="">{leitos.length ? "Selecione…" : "Setor sem leitos"}</option>
              {leitos.map((l) => <option key={l.id} value={l.id}>{l.codigo}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="lbl">Quantidade {produto && `(${produto.unidade})`}</label>
              <input data-testid="saida-quantidade-input" className="field font-mono" type="number" min="0.01" step="any" value={f.quantidade} onChange={(e) => setF({ ...f, quantidade: e.target.value })} required />
            </div>
            <div>
              <label className="lbl">Observação</label>
              <input data-testid="saida-motivo-input" className="field" value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} placeholder="Ex.: prescrição" />
            </div>
          </div>
          <FefoPreview fefo={fefo} />
          <button data-testid="saida-confirmar-button" disabled={busy || (fefo && !fefo.suficiente)} className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-sky-600 font-semibold text-white transition-colors hover:bg-sky-700 disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Confirmar saída
          </button>
        </form>
        <div className="card overflow-hidden xl:col-span-3">
          <h3 className="p-5 pb-3 font-semibold text-slate-800">Últimas saídas</h3>
          <div className="overflow-auto">
            <table className="tbl" data-testid="table-saidas-recentes">
              <thead><tr><th>Data</th><th>Produto</th><th>Lote</th><th>Setor / Leito</th><th className="text-right">Qtd</th><th className="text-right">Valor</th></tr></thead>
              <tbody>
                {(recentes.data || []).map((m) => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap font-mono text-xs">{dateTimeBR(m.created_at)}</td>
                    <td>{m.produto_descricao}</td>
                    <td className="font-mono text-xs">{m.lote_numero}</td>
                    <td className="text-xs">{m.setor_nome}{m.leito_codigo && <span className="ml-1 rounded bg-sky-100 px-1.5 py-0.5 font-mono text-sky-800">{m.leito_codigo}</span>}</td>
                    <td className="text-right font-mono">{num(m.quantidade)}</td>
                    <td className="text-right font-mono">{brl(m.valor)}</td>
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

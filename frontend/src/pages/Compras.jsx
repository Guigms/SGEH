import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, PackageCheck, Sparkles } from "lucide-react";
import { api, errMsg, num, brl, dateTimeBR, can } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useFetch, PageHeader, Empty, StatusPill } from "@/components/common";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const NovoPedido = ({ produtos, sugestao, onDone }) => {
  const [fornecedor, setFornecedor] = useState("");
  const [obs, setObs] = useState("");
  const [itens, setItens] = useState([]);
  const [it, setIt] = useState({ produto_id: "", quantidade: "", preco_estimado: "" });

  const usarSugestao = () => {
    setItens(sugestao.filter((s) => s.quantidade_sugerida > 0).map((s) => ({ produto_id: s.produto_id, descricao: s.descricao, quantidade: s.quantidade_sugerida, preco_estimado: s.preco_estimado })));
  };
  const add = () => {
    const p = produtos.find((x) => x.id === it.produto_id);
    if (!p || !parseFloat(it.quantidade)) return toast.error("Selecione produto e quantidade");
    setItens([...itens, { produto_id: p.id, descricao: p.descricao, quantidade: parseFloat(it.quantidade), preco_estimado: parseFloat(it.preco_estimado) || 0 }]);
    setIt({ produto_id: "", quantidade: "", preco_estimado: "" });
  };
  const total = itens.reduce((s, i) => s + i.quantidade * i.preco_estimado, 0);
  const enviar = async () => {
    try {
      const { data } = await api.post("/compras", { fornecedor, observacao: obs, itens: itens.map(({ produto_id, quantidade, preco_estimado }) => ({ produto_id, quantidade, preco_estimado })) });
      toast.success(`Pedido ${data.numero} criado e enviado para aprovação do gestor`);
      setItens([]);
      setFornecedor("");
      onDone();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <div className="card p-6" data-testid="novo-pedido-form">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-slate-800">Novo pedido de compra</h3>
        {sugestao.length > 0 && <button data-testid="usar-sugestao-button" onClick={usarSugestao} className="flex items-center gap-1 rounded-md border border-emerald-500 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"><Sparkles className="h-3.5 w-3.5" />Usar sugestão ({sugestao.length} itens abaixo do mínimo)</button>}
      </div>
      <div className="grid gap-3 md:grid-cols-12">
        <div className="md:col-span-6"><label className="lbl">Produto</label>
          <select data-testid="compra-produto-select" className="field" value={it.produto_id} onChange={(e) => { const p = produtos.find((x) => x.id === e.target.value); setIt({ ...it, produto_id: e.target.value, preco_estimado: p?.ultimo_custo || "" }); }}>
            <option value="">Selecione…</option>
            {produtos.filter((p) => p.ativo).map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.descricao}</option>)}
          </select>
        </div>
        <div className="md:col-span-2"><label className="lbl">Qtd</label><input data-testid="compra-qtd-input" className="field font-mono" type="number" min="0.01" step="any" value={it.quantidade} onChange={(e) => setIt({ ...it, quantidade: e.target.value })} /></div>
        <div className="md:col-span-3"><label className="lbl">Preço est. (R$)</label><input data-testid="compra-preco-input" className="field font-mono" type="number" min="0" step="0.01" value={it.preco_estimado} onChange={(e) => setIt({ ...it, preco_estimado: e.target.value })} /></div>
        <div className="flex items-end md:col-span-1"><button data-testid="compra-add-item-button" onClick={add} className="flex h-10 w-full items-center justify-center rounded-md border border-sky-600 text-sky-700 hover:bg-sky-50"><Plus className="h-4 w-4" /></button></div>
      </div>
      {itens.length > 0 && (
        <>
          <table className="tbl mt-4" data-testid="compra-itens-table">
            <thead><tr><th>Item</th><th className="text-right">Qtd</th><th className="text-right">Preço</th><th className="text-right">Subtotal</th><th></th></tr></thead>
            <tbody>
              {itens.map((i, idx) => (
                <tr key={idx}>
                  <td>{i.descricao}</td>
                  <td className="text-right"><input className="field h-8 w-24 text-right font-mono" type="number" value={i.quantidade} onChange={(e) => setItens(itens.map((x, j) => (j === idx ? { ...x, quantidade: parseFloat(e.target.value) || 0 } : x)))} /></td>
                  <td className="text-right font-mono">{brl(i.preco_estimado)}</td>
                  <td className="text-right font-mono">{brl(i.quantidade * i.preco_estimado)}</td>
                  <td className="text-right"><button onClick={() => setItens(itens.filter((_, j) => j !== idx))} className="text-rose-500"><Trash2 className="h-4 w-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 grid gap-3 md:grid-cols-12">
            <input data-testid="compra-fornecedor-input" className="field md:col-span-4" placeholder="Fornecedor *" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} />
            <input className="field md:col-span-4" placeholder="Observação / processo licitatório" value={obs} onChange={(e) => setObs(e.target.value)} />
            <div className="flex items-center justify-end gap-3 md:col-span-4">
              <span className="font-mono text-sm font-semibold">{brl(total)}</span>
              <button data-testid="compra-enviar-button" disabled={!fornecedor} onClick={enviar} className="h-10 rounded-md bg-sky-600 px-5 font-semibold text-white hover:bg-sky-700 disabled:opacity-50">Enviar p/ aprovação</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const ReceberDialog = ({ pedido, onClose, onDone }) => {
  const [nf, setNf] = useState("");
  const [itens, setItens] = useState(pedido.itens.map((i) => ({ produto_id: i.produto_id, descricao: i.produto_descricao, lote_numero: "", validade: "", quantidade: i.quantidade, custo_unitario: i.preco_estimado })));
  const upd = (idx, k, v) => setItens(itens.map((x, j) => (j === idx ? { ...x, [k]: v } : x)));
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/compras/${pedido.id}/receber`, { nota_fiscal: nf, itens: itens.map((i) => ({ produto_id: i.produto_id, lote_numero: i.lote_numero, validade: i.validade, quantidade: parseFloat(i.quantidade), custo_unitario: parseFloat(i.custo_unitario) })) });
      toast.success(`Pedido ${pedido.numero} recebido · lotes lançados no estoque`);
      onDone();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl" data-testid="receber-dialog">
        <DialogHeader><DialogTitle>Receber pedido {pedido.numero} · {pedido.fornecedor}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div><label className="lbl">Nota fiscal</label><input data-testid="receber-nf-input" className="field font-mono" value={nf} onChange={(e) => setNf(e.target.value)} required /></div>
          <div className="max-h-80 space-y-3 overflow-auto">
            {itens.map((i, idx) => (
              <div key={idx} className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-5">
                <div className="col-span-2 text-sm font-medium md:col-span-5">{i.descricao}</div>
                <input data-testid={`receber-lote-${idx}`} className="field font-mono" placeholder="Lote" value={i.lote_numero} onChange={(e) => upd(idx, "lote_numero", e.target.value)} required />
                <input data-testid={`receber-validade-${idx}`} className="field font-mono" type="date" value={i.validade} onChange={(e) => upd(idx, "validade", e.target.value)} required />
                <input data-testid={`receber-qtd-${idx}`} className="field font-mono" type="number" step="any" min="0.01" value={i.quantidade} onChange={(e) => upd(idx, "quantidade", e.target.value)} required />
                <input data-testid={`receber-custo-${idx}`} className="field font-mono" type="number" step="0.01" min="0" value={i.custo_unitario} onChange={(e) => upd(idx, "custo_unitario", e.target.value)} required />
              </div>
            ))}
          </div>
          <button data-testid="receber-confirmar-button" className="h-10 w-full rounded-md bg-emerald-600 font-semibold text-white hover:bg-emerald-700">Confirmar recebimento</button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default function Compras() {
  const { user } = useAuth();
  const { data: produtos } = useFetch("/produtos");
  const sug = useFetch("/compras/sugestao");
  const compras = useFetch("/compras");
  const [receber, setReceber] = useState(null);
  const reloadAll = () => { compras.reload(); sug.reload(); };

  const run = async (c, acao) => {
    try {
      const body = acao === "rejeitar" ? { motivo: window.prompt("Motivo da rejeição:") || "" } : {};
      if (acao === "rejeitar" && !body.motivo) return;
      await api.post(`/compras/${c.id}/${acao}`, body);
      toast.success(`Pedido ${c.numero}: ${acao === "aprovar" ? "aprovado" : "rejeitado"}`);
      reloadAll();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <div>
      <PageHeader title="Compras" subtitle="Sugestão automática pelo estoque mínimo → aprovação do gestor → recebimento com nota fiscal e lote" />
      {sug.data && sug.data.length > 0 && (
        <div className="card mb-6 overflow-hidden">
          <h3 className="p-5 pb-3 font-semibold text-slate-800">Sugestão de compra (saldo + pedidos em aberto ≤ mínimo)</h3>
          <table className="tbl" data-testid="table-sugestao-compra">
            <thead><tr><th>Produto</th><th className="text-right">Disponível</th><th className="text-right">Mín / Máx</th><th className="text-right">Em pedido</th><th className="text-right">Sugerido</th><th className="text-right">Estimativa</th></tr></thead>
            <tbody>
              {sug.data.map((s) => (
                <tr key={s.produto_id}>
                  <td>{s.descricao}</td>
                  <td className="text-right font-mono text-orange-700">{num(s.saldo_disponivel)}</td>
                  <td className="text-right font-mono">{num(s.estoque_minimo)} / {num(s.estoque_maximo)}</td>
                  <td className="text-right font-mono">{num(s.em_pedido)}</td>
                  <td className="text-right font-mono font-semibold">{num(s.quantidade_sugerida)} {s.unidade}</td>
                  <td className="text-right font-mono">{brl(s.quantidade_sugerida * s.preco_estimado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {can(user, "compra_criar") && produtos && <NovoPedido produtos={produtos} sugestao={sug.data || []} onDone={reloadAll} />}
      <h3 className="mb-3 mt-8 font-semibold text-slate-800">Pedidos de compra</h3>
      <div className="card overflow-auto">
        <table className="tbl" data-testid="table-pedidos-compra">
          <thead><tr><th>Nº</th><th>Data</th><th>Fornecedor</th><th>Itens</th><th className="text-right">Valor</th><th>Responsáveis</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {(compras.data || []).map((c) => (
              <tr key={c.id} data-testid={`pedido-row-${c.numero}`}>
                <td className="font-mono text-xs font-semibold">{c.numero}</td>
                <td className="whitespace-nowrap font-mono text-xs">{dateTimeBR(c.created_at)}</td>
                <td>{c.fornecedor}{c.nota_fiscal && <div className="font-mono text-[11px] text-slate-400">NF {c.nota_fiscal}</div>}</td>
                <td className="text-xs">{c.itens.map((i, k) => <div key={k}>{num(i.quantidade)} · {i.produto_descricao}</div>)}</td>
                <td className="text-right font-mono font-semibold">{brl(c.valor_total)}</td>
                <td className="text-xs">Criado: {c.criado_por_nome}{c.aprovador_nome && <div>Aprov.: {c.aprovador_nome}</div>}{c.recebido_por_nome && <div>Receb.: {c.recebido_por_nome}</div>}</td>
                <td><StatusPill s={c.status} testId={`pedido-status-${c.numero}`} /></td>
                <td className="whitespace-nowrap text-right">
                  {c.status === "pendente" && can(user, "compra_aprovar") && c.criado_por_id !== user.id && (
                    <>
                      <button data-testid={`aprovar-pedido-${c.numero}`} onClick={() => run(c, "aprovar")} className="mr-1 rounded-md bg-sky-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-sky-700">Aprovar</button>
                      <button data-testid={`rejeitar-pedido-${c.numero}`} onClick={() => run(c, "rejeitar")} className="rounded-md border border-rose-300 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50">Rejeitar</button>
                    </>
                  )}
                  {c.status === "aprovado" && can(user, "compra_receber") && (
                    <button data-testid={`receber-pedido-${c.numero}`} onClick={() => setReceber(c)} className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"><PackageCheck className="h-3 w-3" />Receber</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {compras.data && !compras.data.length && <Empty text="Nenhum pedido de compra." />}
      </div>
      {receber && <ReceberDialog pedido={receber} onClose={() => setReceber(null)} onDone={() => { setReceber(null); reloadAll(); }} />}
    </div>
  );
}

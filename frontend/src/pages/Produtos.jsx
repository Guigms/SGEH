import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import { api, errMsg, num, brl, can, CATEGORIAS } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useFetch, PageHeader, Empty } from "@/components/common";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const EMPTY = { codigo: "", descricao: "", categoria: "medicamento", unidade: "UN", estoque_minimo: 0, estoque_maximo: 0, ativo: true };

const ProdutoDialog = ({ produto, onClose, onDone }) => {
  const [f, setF] = useState(produto?.id ? { ...produto } : EMPTY);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    const body = { codigo: f.codigo, descricao: f.descricao, categoria: f.categoria, unidade: f.unidade, estoque_minimo: parseFloat(f.estoque_minimo), estoque_maximo: parseFloat(f.estoque_maximo), ativo: f.ativo };
    try {
      if (produto?.id) await api.put(`/produtos/${produto.id}`, body);
      else await api.post("/produtos", body);
      toast.success("Produto salvo");
      onDone();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent data-testid="produto-dialog">
        <DialogHeader><DialogTitle>{produto?.id ? "Editar produto" : "Novo produto"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-2 gap-3">
          <div><label className="lbl">Código</label><input data-testid="produto-codigo-input" className="field font-mono" value={f.codigo} onChange={set("codigo")} required /></div>
          <div><label className="lbl">Unidade</label><input data-testid="produto-unidade-input" className="field" value={f.unidade} onChange={set("unidade")} required /></div>
          <div className="col-span-2"><label className="lbl">Descrição</label><input data-testid="produto-descricao-input" className="field" value={f.descricao} onChange={set("descricao")} required /></div>
          <div className="col-span-2"><label className="lbl">Categoria</label>
            <select data-testid="produto-categoria-select" className="field" value={f.categoria} onChange={set("categoria")}>
              {Object.entries(CATEGORIAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div><label className="lbl">Estoque mínimo</label><input data-testid="produto-min-input" className="field font-mono" type="number" min="0" value={f.estoque_minimo} onChange={set("estoque_minimo")} /></div>
          <div><label className="lbl">Estoque máximo</label><input data-testid="produto-max-input" className="field font-mono" type="number" min="0" value={f.estoque_maximo} onChange={set("estoque_maximo")} /></div>
          <label className="col-span-2 flex items-center gap-2 text-sm"><input data-testid="produto-ativo-checkbox" type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} /> Ativo</label>
          <button data-testid="produto-salvar-button" className="col-span-2 h-10 rounded-md bg-sky-600 font-semibold text-white hover:bg-sky-700">Salvar</button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default function Produtos() {
  const { user } = useAuth();
  const { data, reload } = useFetch("/produtos");
  const [cat, setCat] = useState("");
  const [busca, setBusca] = useState("");
  const [edit, setEdit] = useState(null);
  const lista = useMemo(() => (data || []).filter((p) => (!cat || p.categoria === cat) && (!busca || `${p.codigo} ${p.descricao}`.toLowerCase().includes(busca.toLowerCase()))), [data, cat, busca]);

  return (
    <div>
      <PageHeader title="Cadastro de Produtos" subtitle="Saldos, custo médio ponderado e valor em estoque por item">
        {can(user, "produtos_write") && <button data-testid="novo-produto-button" onClick={() => setEdit({})} className="flex h-10 items-center gap-2 rounded-md bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700"><Plus className="h-4 w-4" />Novo produto</button>}
      </PageHeader>
      <div className="mb-4 flex flex-wrap gap-2">
        <select data-testid="produtos-categoria-filtro" className="field max-w-xs" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Todas as categorias</option>
          {Object.entries(CATEGORIAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input data-testid="produtos-busca-input" className="field max-w-xs" placeholder="Buscar…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      <div className="card overflow-auto">
        <table className="tbl" data-testid="table-produtos">
          <thead><tr><th>Código</th><th>Descrição</th><th>Categoria</th><th className="text-right">Disponível</th><th className="text-right">Físico</th><th className="text-right">Mín / Máx</th><th className="text-right">Custo médio</th><th className="text-right">Valor estoque</th><th></th></tr></thead>
          <tbody>
            {lista.map((p) => (
              <tr key={p.id} className={p.ativo ? "" : "opacity-50"}>
                <td className="font-mono text-xs">{p.codigo}</td>
                <td className="font-medium">{p.descricao}</td>
                <td className="text-xs">{CATEGORIAS[p.categoria]}</td>
                <td className={`text-right font-mono ${p.abaixo_minimo ? "font-semibold text-orange-700" : ""}`}>{num(p.saldo_disponivel)} {p.unidade}</td>
                <td className="text-right font-mono text-slate-500">{num(p.saldo_fisico)}</td>
                <td className="text-right font-mono text-xs">{num(p.estoque_minimo)} / {num(p.estoque_maximo)}</td>
                <td className="text-right font-mono">{brl(p.custo_medio)}</td>
                <td className="text-right font-mono font-semibold">{brl(p.valor_estoque)}</td>
                <td>{can(user, "produtos_write") && <button data-testid={`editar-produto-${p.codigo}`} onClick={() => setEdit(p)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100"><Pencil className="h-4 w-4" /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && !lista.length && <Empty />}
      </div>
      {edit && <ProdutoDialog produto={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload(); }} />}
    </div>
  );
}

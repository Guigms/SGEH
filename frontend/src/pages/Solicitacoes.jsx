import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Ban, ShieldAlert } from "lucide-react";
import { api, errMsg, num, dateTimeBR, can, CATEGORIAS, ASSISTENCIAIS } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useFetch, PageHeader, Empty, StatusPill } from "@/components/common";

const NovaSolicitacao = ({ user, setores, onDone }) => {
  const fixo = user.role === "solicitante";
  const [setorId, setSetorId] = useState(fixo ? user.setor_id : "");
  const [info, setInfo] = useState(null);
  const [leitos, setLeitos] = useState([]);
  const [itens, setItens] = useState([]);
  const [item, setItem] = useState({ produto_id: "", quantidade: "", leito_id: "" });
  const [obs, setObs] = useState("");

  useEffect(() => {
    setInfo(null);
    setItens([]);
    setLeitos([]);
    if (!setorId) return;
    api.get(`/solicitacoes/produtos?setor_id=${setorId}`).then((r) => setInfo(r.data)).catch((e) => toast.error(errMsg(e)));
    api.get(`/leitos?setor_id=${setorId}`).then((r) => setLeitos(r.data.filter((l) => l.ativo)));
  }, [setorId]);

  const prod = info?.produtos.find((p) => p.id === item.produto_id);
  const precisaLeito = info?.setor.tipo === "assistencial" && prod && ASSISTENCIAIS.includes(prod.categoria);
  const bloqueados = info ? info.produtos.filter((p) => !p.permitido) : [];

  const add = () => {
    if (!prod || !parseFloat(item.quantidade)) return toast.error("Selecione produto e quantidade");
    if (precisaLeito && !item.leito_id) return toast.error("Item assistencial: selecione o leito");
    const leito = leitos.find((l) => l.id === item.leito_id);
    setItens([...itens, { ...item, quantidade: parseFloat(item.quantidade), descricao: prod.descricao, unidade: prod.unidade, leito_codigo: leito?.codigo }]);
    setItem({ produto_id: "", quantidade: "", leito_id: "" });
  };

  const enviar = async () => {
    try {
      const { data } = await api.post("/solicitacoes", { setor_id: setorId, observacao: obs, itens: itens.map(({ produto_id, quantidade, leito_id }) => ({ produto_id, quantidade, leito_id: leito_id || null })) });
      toast.success(`Solicitação ${data.numero} enviada`);
      setItens([]);
      setObs("");
      onDone();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <div className="card p-6" data-testid="nova-solicitacao-form">
      <h3 className="mb-4 font-semibold text-slate-800">Nova solicitação</h3>
      <div className="grid gap-3 md:grid-cols-12">
        <div className="md:col-span-3">
          <label className="lbl">Setor</label>
          <select data-testid="solicitacao-setor-select" className="field" value={setorId || ""} onChange={(e) => setSetorId(e.target.value)} disabled={fixo}>
            <option value="">Selecione…</option>
            {setores.filter((s) => s.ativo).map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </div>
        <div className="md:col-span-4">
          <label className="lbl">Item</label>
          <select data-testid="solicitacao-item-select" className="field" value={item.produto_id} onChange={(e) => setItem({ ...item, produto_id: e.target.value })} disabled={!info}>
            <option value="">Selecione…</option>
            {(info?.produtos || []).map((p) => (
              <option key={p.id} value={p.id} disabled={!p.permitido}>{p.permitido ? "" : "⛔ "}{p.descricao} — {CATEGORIAS[p.categoria]}</option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="lbl">Leito {precisaLeito && <span className="text-rose-600">*</span>}</label>
          <select data-testid="solicitacao-leito-select" className="field" value={item.leito_id} onChange={(e) => setItem({ ...item, leito_id: e.target.value })} disabled={!leitos.length}>
            <option value="">{leitos.length ? "—" : "Sem leitos"}</option>
            {leitos.map((l) => <option key={l.id} value={l.id}>{l.codigo}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="lbl">Qtd {prod && `(${prod.unidade})`}</label>
          <input data-testid="solicitacao-qtd-input" className="field font-mono" type="number" min="0.01" step="any" value={item.quantidade} onChange={(e) => setItem({ ...item, quantidade: e.target.value })} />
        </div>
        <div className="flex items-end md:col-span-1">
          <button data-testid="solicitacao-add-item-button" onClick={add} className="flex h-10 w-full items-center justify-center rounded-md border border-sky-600 text-sky-700 hover:bg-sky-50"><Plus className="h-4 w-4" /></button>
        </div>
      </div>
      {info && bloqueados.length > 0 && (
        <div data-testid="solicitacao-categoria-bloqueada-alerta" className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>O setor <b>{info.setor.nome}</b> pode solicitar apenas: {info.setor.categorias_permitidas.map((c) => CATEGORIAS[c]).join(", ")}. {bloqueados.length} item(ns) bloqueado(s) para este setor.</span>
        </div>
      )}
      {itens.length > 0 && (
        <div className="mt-4">
          <table className="tbl" data-testid="solicitacao-itens-table">
            <thead><tr><th>Item</th><th>Leito</th><th className="text-right">Qtd</th><th></th></tr></thead>
            <tbody>
              {itens.map((it, i) => (
                <tr key={i}>
                  <td>{it.descricao}</td>
                  <td className="font-mono text-xs">{it.leito_codigo || "-"}</td>
                  <td className="text-right font-mono">{num(it.quantidade)} {it.unidade}</td>
                  <td className="text-right"><button onClick={() => setItens(itens.filter((_, j) => j !== i))} className="text-rose-500"><Trash2 className="h-4 w-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex flex-wrap gap-3">
            <input data-testid="solicitacao-obs-input" className="field flex-1" placeholder="Observação (opcional)" value={obs} onChange={(e) => setObs(e.target.value)} />
            <button data-testid="solicitacao-enviar-button" onClick={enviar} className="h-10 rounded-md bg-sky-600 px-6 font-semibold text-white hover:bg-sky-700">Enviar solicitação</button>
          </div>
        </div>
      )}
    </div>
  );
};

const Acoes = ({ s, user, onDone }) => {
  const run = async (acao, body) => {
    try {
      await api.post(`/solicitacoes/${s.id}/${acao}`, body);
      toast.success(`Solicitação ${s.numero}: ${acao} ok`);
      onDone();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const rejeitar = () => {
    const motivo = window.prompt("Motivo da rejeição:");
    if (motivo) run("rejeitar", { motivo });
  };
  const btn = "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors";
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {s.status === "pendente" && can(user, "aprovar_solicitacao") && s.solicitante_id !== user.id && (
        <button data-testid={`aprovar-sol-${s.numero}`} onClick={() => run("aprovar")} className={`${btn} bg-sky-600 text-white hover:bg-sky-700`}>Aprovar</button>
      )}
      {["pendente", "aprovada"].includes(s.status) && can(user, "aprovar_solicitacao") && (
        <button data-testid={`rejeitar-sol-${s.numero}`} onClick={rejeitar} className={`${btn} border border-rose-300 text-rose-700 hover:bg-rose-50`}>Rejeitar</button>
      )}
      {s.status === "aprovada" && can(user, "atender_solicitacao") && (
        <button data-testid={`atender-sol-${s.numero}`} onClick={() => run("atender")} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>Atender (FEFO)</button>
      )}
      {s.status === "pendente" && (s.solicitante_id === user.id || user.role === "admin") && (
        <button data-testid={`cancelar-sol-${s.numero}`} onClick={() => run("cancelar")} className={`${btn} border border-slate-300 text-slate-600 hover:bg-slate-50`}><Ban className="inline h-3 w-3" /> Cancelar</button>
      )}
    </div>
  );
};

export default function Solicitacoes() {
  const { user } = useAuth();
  const { data: setores } = useFetch("/setores");
  const [status, setStatus] = useState("");
  const sols = useFetch(`/solicitacoes${status ? `?status=${status}` : ""}`);
  const meuSetor = setores?.find((s) => s.id === user.setor_id);

  return (
    <div>
      <PageHeader title="Solicitações por Setor" subtitle={user.role === "solicitante" ? `Setor: ${meuSetor?.nome || "-"} · cada setor solicita apenas as categorias permitidas` : "Aprovação e atendimento das solicitações dos setores"} />
      {can(user, "solicitar") && setores && <NovaSolicitacao user={user} setores={setores} onDone={sols.reload} />}
      <div className="mb-3 mt-8 flex flex-wrap items-center gap-2">
        {["", "pendente", "aprovada", "atendida", "rejeitada", "cancelada"].map((s) => (
          <button key={s} data-testid={`filtro-sol-${s || "todas"}`} onClick={() => setStatus(s)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold capitalize ${status === s ? "border-sky-600 bg-sky-600 text-white" : "border-slate-300 bg-white text-slate-600"}`}>{s || "Todas"}</button>
        ))}
      </div>
      <div className="card overflow-auto">
        <table className="tbl" data-testid="table-solicitacoes-setor">
          <thead><tr><th>Nº</th><th>Data</th><th>Setor</th><th>Itens</th><th>Solicitante</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {(sols.data || []).map((s) => (
              <tr key={s.id} data-testid={`sol-row-${s.numero}`}>
                <td className="font-mono text-xs font-semibold">{s.numero}</td>
                <td className="whitespace-nowrap font-mono text-xs">{dateTimeBR(s.created_at)}</td>
                <td>{s.setor_nome}</td>
                <td className="text-xs">
                  {s.itens.map((it, i) => (
                    <div key={i}>{num(it.quantidade)} {it.unidade} · {it.produto_descricao}{it.leito_codigo && <span className="ml-1 rounded bg-sky-100 px-1 font-mono text-sky-800">{it.leito_codigo}</span>}</div>
                  ))}
                  {s.motivo_rejeicao && <div className="mt-1 text-rose-600">Motivo: {s.motivo_rejeicao}</div>}
                </td>
                <td className="text-xs">{s.solicitante_nome}{s.aprovador_nome && <div className="text-slate-400">Aprov.: {s.aprovador_nome}</div>}</td>
                <td><StatusPill s={s.status} testId={`sol-status-${s.numero}`} /></td>
                <td><Acoes s={s} user={user} onDone={sols.reload} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {sols.data && !sols.data.length && <Empty />}
      </div>
    </div>
  );
}

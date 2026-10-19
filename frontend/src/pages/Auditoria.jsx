import { useState } from "react";
import { useFetch, PageHeader, Empty, StatusPill } from "@/components/common";
import { num, brl, dateTimeBR, dateBR } from "@/lib/api";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const qs = (o) => Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");

const Logs = () => {
  const [f, setF] = useState({ usuario: "", acao: "", busca: "", de: "", ate: "" });
  const [q, setQ] = useState("");
  const { data } = useFetch(`/auditoria?${q}`);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <>
      <form onSubmit={(e) => { e.preventDefault(); setQ(qs(f)); }} className="mb-4 grid gap-2 md:grid-cols-6">
        <input data-testid="audit-usuario-input" className="field" placeholder="Usuário" value={f.usuario} onChange={set("usuario")} />
        <input data-testid="audit-acao-input" className="field" placeholder="Ação (ex.: saida)" value={f.acao} onChange={set("acao")} />
        <input data-testid="audit-busca-input" className="field" placeholder="Lote, leito, produto…" value={f.busca} onChange={set("busca")} />
        <input data-testid="audit-de-input" className="field" type="date" value={f.de} onChange={set("de")} />
        <input data-testid="audit-ate-input" className="field" type="date" value={f.ate} onChange={set("ate")} />
        <button data-testid="audit-filtrar-button" className="h-10 rounded-md bg-sky-600 font-semibold text-white hover:bg-sky-700">Filtrar</button>
      </form>
      <div className="card max-h-[600px] overflow-auto">
        <table className="tbl" data-testid="table-auditoria-logs">
          <thead><tr><th>Data/hora</th><th>Usuário</th><th>Perfil</th><th>Ação</th><th>Detalhes</th></tr></thead>
          <tbody>
            {(data || []).map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap font-mono text-xs">{dateTimeBR(l.created_at)}</td>
                <td className="text-xs font-medium">{l.usuario_nome}</td>
                <td className="text-xs text-slate-500">{l.role}</td>
                <td><span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px]">{l.acao}</span></td>
                <td className="text-xs">{l.detalhes}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && !data.length && <Empty />}
      </div>
    </>
  );
};

const Movimentos = () => {
  const [f, setF] = useState({ tipo: "", lote: "", de: "", ate: "" });
  const [q, setQ] = useState("limit=500");
  const { data } = useFetch(`/movimentos?${q}`);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <>
      <form onSubmit={(e) => { e.preventDefault(); setQ(`limit=500&${qs(f)}`); }} className="mb-4 grid gap-2 md:grid-cols-5">
        <select data-testid="mov-tipo-select" className="field" value={f.tipo} onChange={set("tipo")}>
          <option value="">Todos os tipos</option><option value="entrada">Entrada</option><option value="saida">Saída</option><option value="devolucao">Devolução</option><option value="perda">Perda</option>
        </select>
        <input data-testid="mov-lote-input" className="field" placeholder="Nº do lote (rastrear)" value={f.lote} onChange={set("lote")} />
        <input className="field" type="date" value={f.de} onChange={set("de")} />
        <input className="field" type="date" value={f.ate} onChange={set("ate")} />
        <button data-testid="mov-filtrar-button" className="h-10 rounded-md bg-sky-600 font-semibold text-white hover:bg-sky-700">Filtrar</button>
      </form>
      <div className="card max-h-[600px] overflow-auto">
        <table className="tbl" data-testid="table-movimentos">
          <thead><tr><th>Data/hora</th><th>Tipo</th><th>Produto</th><th>Lote / Val.</th><th>Setor / Leito</th><th className="text-right">Qtd</th><th className="text-right">Valor</th><th>Usuário</th><th>Obs.</th></tr></thead>
          <tbody>
            {(data || []).map((m) => (
              <tr key={m.id}>
                <td className="whitespace-nowrap font-mono text-xs">{dateTimeBR(m.created_at)}</td>
                <td><StatusPill s={m.tipo} /></td>
                <td className="text-xs">{m.produto_descricao}</td>
                <td className="font-mono text-xs">{m.lote_numero}<div className="text-slate-400">{dateBR(m.validade)}</div></td>
                <td className="text-xs">{m.setor_nome || m.fornecedor || "-"}{m.leito_codigo && <span className="ml-1 rounded bg-sky-100 px-1 font-mono text-sky-800">{m.leito_codigo}</span>}</td>
                <td className="text-right font-mono">{num(m.quantidade)}</td>
                <td className="text-right font-mono">{brl(m.valor)}</td>
                <td className="text-xs">{m.usuario_nome}</td>
                <td className="max-w-[200px] truncate text-xs text-slate-500" title={m.motivo || m.documento}>{m.motivo || m.documento}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && !data.length && <Empty />}
      </div>
    </>
  );
};

export default function Auditoria() {
  return (
    <div>
      <PageHeader title="Auditoria & Rastreabilidade" subtitle="Trilha imutável de ações e movimentos. Busque um lote para ver todos os setores e leitos que o receberam." />
      <Tabs defaultValue="mov">
        <TabsList className="mb-4">
          <TabsTrigger data-testid="tab-movimentos" value="mov">Movimentações</TabsTrigger>
          <TabsTrigger data-testid="tab-logs" value="logs">Log de ações</TabsTrigger>
        </TabsList>
        <TabsContent value="mov"><Movimentos /></TabsContent>
        <TabsContent value="logs"><Logs /></TabsContent>
      </Tabs>
    </div>
  );
}

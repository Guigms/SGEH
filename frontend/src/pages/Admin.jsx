import { useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import { api, errMsg, ROLES, CATEGORIAS } from "@/lib/api";
import { useFetch, PageHeader } from "@/components/common";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const TIPOS = { assistencial: "Assistencial", administrativo: "Administrativo", apoio: "Apoio (ex.: CCIH)", estoque: "Estoque / Farmácia" };

const save = async (url, id, body, done) => {
  try {
    if (id) await api.put(`${url}/${id}`, body);
    else await api.post(url, body);
    toast.success("Salvo com sucesso");
    done();
  } catch (e) {
    toast.error(errMsg(e));
  }
};

const UserDialog = ({ u, setores, onClose, onDone }) => {
  const [f, setF] = useState({ email: u.email || "", nome: u.nome || "", role: u.role || "solicitante", setor_id: u.setor_id || "", password: "", ativo: u.ativo ?? true });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent data-testid="user-dialog">
        <DialogHeader><DialogTitle>{u.id ? "Editar usuário" : "Novo usuário"}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); save("/users", u.id, { ...f, setor_id: f.setor_id || null, password: f.password || null }, onDone); }} className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><label className="lbl">Nome</label><input data-testid="user-nome-input" className="field" value={f.nome} onChange={set("nome")} required /></div>
          <div className="col-span-2"><label className="lbl">E-mail</label><input data-testid="user-email-input" className="field" type="email" value={f.email} onChange={set("email")} required disabled={!!u.id} /></div>
          <div><label className="lbl">Perfil de acesso</label>
            <select data-testid="user-role-selector" className="field" value={f.role} onChange={set("role")}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </div>
          <div><label className="lbl">Setor</label>
            <select data-testid="user-setor-select" className="field" value={f.setor_id} onChange={set("setor_id")} required={f.role === "solicitante"}>
              <option value="">—</option>{setores.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </div>
          <div className="col-span-2"><label className="lbl">{u.id ? "Nova senha (opcional)" : "Senha"}</label><input data-testid="user-password-input" className="field" type="password" value={f.password} onChange={set("password")} required={!u.id} minLength={6} /></div>
          <label className="col-span-2 flex items-center gap-2 text-sm"><input data-testid="user-ativo-checkbox" type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} /> Ativo</label>
          <button data-testid="user-salvar-button" className="col-span-2 h-10 rounded-md bg-sky-600 font-semibold text-white hover:bg-sky-700">Salvar</button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const SetorDialog = ({ s, onClose, onDone }) => {
  const [f, setF] = useState({ nome: s.nome || "", tipo: s.tipo || "assistencial", categorias_permitidas: s.categorias_permitidas || Object.keys(CATEGORIAS), ativo: s.ativo ?? true });
  const toggle = (c) => setF({ ...f, categorias_permitidas: f.categorias_permitidas.includes(c) ? f.categorias_permitidas.filter((x) => x !== c) : [...f.categorias_permitidas, c] });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent data-testid="setor-dialog">
        <DialogHeader><DialogTitle>{s.id ? "Editar setor" : "Novo setor"}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); save("/setores", s.id, f, onDone); }} className="space-y-3">
          <div><label className="lbl">Nome</label><input data-testid="setor-nome-input" className="field" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} required /></div>
          <div><label className="lbl">Tipo</label>
            <select data-testid="setor-tipo-select" className="field" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>{Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </div>
          <div>
            <label className="lbl">Categorias que o setor pode solicitar/receber</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(CATEGORIAS).map(([k, v]) => (
                <label key={k} className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
                  <input data-testid={`setor-cat-${k}`} type="checkbox" checked={f.categorias_permitidas.includes(k)} onChange={() => toggle(k)} /> {v}
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} /> Ativo</label>
          <button data-testid="setor-salvar-button" className="h-10 w-full rounded-md bg-sky-600 font-semibold text-white hover:bg-sky-700">Salvar</button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const NovoLeito = ({ setores, onDone }) => {
  const [f, setF] = useState({ codigo: "", setor_id: "" });
  return (
    <form onSubmit={(e) => { e.preventDefault(); save("/leitos", null, { ...f, ativo: true }, () => { setF({ ...f, codigo: "" }); onDone(); }); }} className="mb-4 flex flex-wrap gap-2">
      <select data-testid="leito-setor-select" className="field max-w-xs" value={f.setor_id} onChange={(e) => setF({ ...f, setor_id: e.target.value })} required>
        <option value="">Setor…</option>{setores.filter((s) => s.tipo === "assistencial").map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
      </select>
      <input data-testid="leito-codigo-input" className="field max-w-[160px] font-mono" placeholder="Código (ex.: UTI-09)" value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value })} required />
      <button data-testid="leito-add-button" className="flex h-10 items-center gap-1 rounded-md bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700"><Plus className="h-4 w-4" />Adicionar leito</button>
    </form>
  );
};

const AddBtn = ({ onClick, testId, label }) => (
  <button data-testid={testId} onClick={onClick} className="mb-4 flex h-10 items-center gap-1 rounded-md bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700"><Plus className="h-4 w-4" />{label}</button>
);

export default function Admin() {
  const users = useFetch("/users");
  const setores = useFetch("/setores");
  const leitos = useFetch("/leitos");
  const [eu, setEu] = useState(null);
  const [es, setEs] = useState(null);
  const sMap = Object.fromEntries((setores.data || []).map((s) => [s.id, s]));

  const toggleLeito = async (l) => {
    await save("/leitos", l.id, { codigo: l.codigo, setor_id: l.setor_id, ativo: !l.ativo }, leitos.reload);
  };

  return (
    <div>
      <PageHeader title="Administração" subtitle="Usuários e níveis de acesso, setores com categorias permitidas e leitos" />
      <Tabs defaultValue="users">
        <TabsList className="mb-4">
          <TabsTrigger data-testid="tab-usuarios" value="users">Usuários</TabsTrigger>
          <TabsTrigger data-testid="tab-setores" value="setores">Setores</TabsTrigger>
          <TabsTrigger data-testid="tab-leitos" value="leitos">Leitos</TabsTrigger>
        </TabsList>
        <TabsContent value="users">
          <AddBtn testId="novo-usuario-button" label="Novo usuário" onClick={() => setEu({})} />
          <div className="card overflow-auto">
            <table className="tbl" data-testid="table-usuarios">
              <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Setor</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {(users.data || []).map((u) => (
                  <tr key={u.id}>
                    <td className="font-medium">{u.nome}</td><td className="text-xs">{u.email}</td><td className="text-xs">{ROLES[u.role]}</td>
                    <td className="text-xs">{sMap[u.setor_id]?.nome || "-"}</td>
                    <td className="text-xs">{u.ativo ? "Ativo" : "Inativo"}</td>
                    <td><button data-testid={`editar-usuario-${u.email}`} onClick={() => setEu(u)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100"><Pencil className="h-4 w-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
        <TabsContent value="setores">
          <AddBtn testId="novo-setor-button" label="Novo setor" onClick={() => setEs({})} />
          <div className="card overflow-auto">
            <table className="tbl" data-testid="table-setores">
              <thead><tr><th>Setor</th><th>Tipo</th><th>Categorias permitidas</th><th></th></tr></thead>
              <tbody>
                {(setores.data || []).map((s) => (
                  <tr key={s.id}>
                    <td className="font-medium">{s.nome}</td><td className="text-xs">{TIPOS[s.tipo]}</td>
                    <td className="text-xs">{s.categorias_permitidas.map((c) => <span key={c} className="mb-1 mr-1 inline-block rounded bg-slate-100 px-1.5 py-0.5">{CATEGORIAS[c]}</span>)}</td>
                    <td><button data-testid={`editar-setor-${s.nome}`} onClick={() => setEs(s)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100"><Pencil className="h-4 w-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
        <TabsContent value="leitos">
          {setores.data && <NovoLeito setores={setores.data} onDone={leitos.reload} />}
          <div className="grid gap-4 md:grid-cols-3">
            {(setores.data || []).filter((s) => s.tipo === "assistencial").map((s) => (
              <div key={s.id} className="card p-4">
                <h4 className="mb-3 font-semibold text-slate-800">{s.nome}</h4>
                <div className="flex flex-wrap gap-2">
                  {(leitos.data || []).filter((l) => l.setor_id === s.id).map((l) => (
                    <button key={l.id} data-testid={`leito-${l.codigo}`} onClick={() => toggleLeito(l)} title="Clique para ativar/desativar" className={`rounded-md border px-2 py-1 font-mono text-xs ${l.ativo ? "border-sky-300 bg-sky-50 text-sky-800" : "border-slate-200 bg-slate-100 text-slate-400 line-through"}`}>{l.codigo}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
      {eu && setores.data && <UserDialog u={eu} setores={setores.data} onClose={() => setEu(null)} onDone={() => { setEu(null); users.reload(); }} />}
      {es && <SetorDialog s={es} onClose={() => setEs(null)} onDone={() => { setEs(null); setores.reload(); }} />}
    </div>
  );
}

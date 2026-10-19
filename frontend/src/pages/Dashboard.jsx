import { Link } from "react-router-dom";
import { Wallet, AlertTriangle, TrendingDown, ClipboardList, PackageX, ShoppingCart } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { useFetch, PageHeader, SituacaoBadge, Empty } from "@/components/common";
import { brl, num, dateBR } from "@/lib/api";

const Kpi = ({ icon: Icon, label, value, sub, tone, testId }) => (
  <div data-testid={testId} className={`card p-5 fade-up ${tone || ""}`}>
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <Icon className="h-4 w-4 text-slate-400" />
    </div>
    <div className="mt-3 font-mono text-2xl font-semibold text-slate-900">{value}</div>
    {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
  </div>
);

const FAIXAS = [
  ["vencido", "Vencidos", "border-rose-300 bg-rose-50"],
  ["risco_30", "Vencem em até 30 dias", "border-amber-300 bg-amber-50"],
  ["risco_60", "31 a 60 dias", "border-yellow-300 bg-yellow-50"],
  ["risco_90", "61 a 90 dias", "border-blue-200 bg-blue-50"],
  ["bloqueado", "Bloqueados", "border-slate-300 bg-slate-100"],
];
const COLORS = ["#0284C7", "#059669", "#F59E0B", "#E11D48", "#64748B"];

export default function Dashboard() {
  const { data: d } = useFetch("/dashboard");
  if (!d) return <div className="text-slate-400">Carregando indicadores…</div>;
  return (
    <div>
      <PageHeader title="Painel de Controle" subtitle="Visão geral do estoque, riscos de validade e consumo dos últimos 30 dias" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi testId="kpi-valor-total-estoque" icon={Wallet} label="Valor em estoque" value={brl(d.valor_total_estoque)} sub={`${d.total_produtos} produtos · custo médio ponderado`} />
        <Kpi testId="kpi-lotes-em-risco" icon={AlertTriangle} label="Lotes em risco" value={d.lotes_em_risco} sub="vencidos + vencendo em 90 dias" tone="border-amber-300" />
        <Kpi testId="kpi-valor-lotes-risco" icon={TrendingDown} label="Valor dos lotes em risco" value={brl(d.valor_em_risco)} sub={`${d.percentual_risco}% do estoque`} tone="border-rose-300" />
        <Kpi testId="kpi-itens-abaixo-minimo" icon={PackageX} label="Abaixo do mínimo" value={d.itens_abaixo_minimo.length} sub="itens para reposição" />
        <Kpi testId="kpi-solicitacoes-pendentes" icon={ClipboardList} label="Solicitações abertas" value={d.solicitacoes_pendentes} sub={`${d.compras_pendentes} pedidos de compra em aberto`} />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {FAIXAS.map(([k, label, cls]) => (
          <div key={k} data-testid={`faixa-${k}`} className={`rounded-xl border p-4 ${cls}`}>
            <div className="text-xs font-semibold text-slate-600">{label}</div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="font-mono text-xl font-semibold text-slate-900">{d.faixas[k].qtd_lotes}</span>
              <span className="font-mono text-sm text-slate-700">{brl(d.faixas[k].valor)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="card p-5 xl:col-span-2">
          <h3 className="mb-4 font-semibold text-slate-800">Consumo por setor (R$, 30 dias)</h3>
          <div className="h-64" data-testid="chart-consumo-setor">
            <ResponsiveContainer>
              <BarChart data={d.consumo_por_setor}>
                <XAxis dataKey="setor" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => brl(v)} />
                <Bar dataKey="valor" fill="#0284C7" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card p-5">
          <h3 className="mb-4 font-semibold text-slate-800">Valor por categoria</h3>
          <div className="h-48">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={d.valor_por_categoria} dataKey="valor" nameKey="categoria" innerRadius={45} outerRadius={75}>
                  {d.valor_por_categoria.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => brl(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 space-y-1 text-xs">
            {d.valor_por_categoria.map((c, i) => (
              <li key={c.categoria} className="flex justify-between">
                <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />{c.categoria}</span>
                <span className="font-mono">{brl(c.valor)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="card overflow-hidden xl:col-span-2">
          <div className="flex items-center justify-between p-5 pb-3">
            <h3 className="font-semibold text-slate-800">Lotes em risco (ordem FEFO)</h3>
            <Link to="/lotes" className="text-xs font-semibold text-sky-700 hover:underline">Ver todos os lotes</Link>
          </div>
          <div className="max-h-96 overflow-auto">
            <table className="tbl" data-testid="table-lotes-risco">
              <thead><tr><th>Produto</th><th>Lote</th><th>Validade</th><th>Situação</th><th className="text-right">Qtd</th><th className="text-right">Valor</th></tr></thead>
              <tbody>
                {d.lotes_risco.map((l) => (
                  <tr key={l.id}>
                    <td className="font-medium">{l.produto_descricao}</td>
                    <td className="font-mono text-xs">{l.numero}</td>
                    <td className="font-mono text-xs">{dateBR(l.validade)}</td>
                    <td><SituacaoBadge s={l.situacao} /></td>
                    <td className="text-right font-mono">{num(l.quantidade)} {l.unidade}</td>
                    <td className="text-right font-mono font-semibold">{brl(l.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!d.lotes_risco.length && <Empty text="Nenhum lote em risco." />}
          </div>
        </div>
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between p-5 pb-3">
            <h3 className="font-semibold text-slate-800">Abaixo do estoque mínimo</h3>
            <Link to="/compras" className="flex items-center gap-1 text-xs font-semibold text-sky-700 hover:underline"><ShoppingCart className="h-3 w-3" />Comprar</Link>
          </div>
          <ul className="divide-y divide-slate-100" data-testid="list-abaixo-minimo">
            {d.itens_abaixo_minimo.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <span className="text-slate-700">{p.descricao}</span>
                <span className="font-mono text-xs text-orange-700">{num(p.saldo_disponivel)} / {num(p.estoque_minimo)}</span>
              </li>
            ))}
          </ul>
          {!d.itens_abaixo_minimo.length && <Empty text="Todos os itens acima do mínimo." />}
        </div>
      </div>
    </div>
  );
}

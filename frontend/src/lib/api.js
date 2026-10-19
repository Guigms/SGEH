import axios from "axios";

export const api = axios.create({ baseURL: `${process.env.REACT_APP_BACKEND_URL}/api` });

api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem("sgeh_token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  (e) => {
    if (e.response?.status === 401 && !e.config.url.includes("/auth/login")) {
      localStorage.removeItem("sgeh_token");
      if (window.location.pathname !== "/login") window.location.href = "/login";
    }
    return Promise.reject(e);
  }
);

export function errMsg(e) {
  const d = e?.response?.data?.detail;
  if (d == null) return e?.message || "Ocorreu um erro. Tente novamente.";
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg || JSON.stringify(x)).join(" ");
  return d.msg || String(d);
}

export const brl = (v) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const num = (v) => (v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
export const dateBR = (s) => (s ? new Date(s.length === 10 ? `${s}T12:00:00` : s).toLocaleDateString("pt-BR") : "-");
export const dateTimeBR = (s) => (s ? new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "-");

export const CATEGORIAS = {
  medicamento: "Medicamento",
  material_assistencial: "Material Assistencial",
  epi: "EPI",
  higiene_limpeza: "Higiene e Limpeza",
  escritorio: "Material de Escritório",
};
export const ASSISTENCIAIS = ["medicamento", "material_assistencial"];

export const ROLES = {
  admin: "Administrador",
  gestor: "Gestor / Aprovador",
  farmaceutico: "Farmacêutico",
  estoquista: "Estoquista / Almoxarife",
  comprador: "Comprador",
  solicitante: "Solicitante do Setor",
  auditor: "Auditor (somente leitura)",
};

const STOCK = ["admin", "farmaceutico", "estoquista"];
export const PERMS = {
  ver_estoque: ["admin", "gestor", "farmaceutico", "estoquista", "comprador", "auditor"],
  produtos_write: STOCK,
  entrada: STOCK,
  saida: STOCK,
  devolucao: STOCK,
  lote_status: ["admin", "farmaceutico"],
  baixa: ["admin", "farmaceutico"],
  solicitar: ["admin", "gestor", "farmaceutico", "estoquista", "comprador", "solicitante"],
  aprovar_solicitacao: ["admin", "gestor", "farmaceutico"],
  atender_solicitacao: STOCK,
  compra_ver: ["admin", "gestor", "comprador", "farmaceutico", "estoquista", "auditor"],
  compra_criar: ["admin", "gestor", "comprador"],
  compra_aprovar: ["admin", "gestor"],
  compra_receber: STOCK,
  auditoria: ["admin", "gestor", "auditor"],
  admin: ["admin"],
};
export const can = (user, perm) => !!user && PERMS[perm].includes(user.role);

# SGEH - Hospital stock management API regression tests (auth, RBAC, entrada/saida FEFO, lotes, devolucao, solicitacoes, compras, auditoria, admin)
import os
import uuid
from datetime import date, timedelta
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN = ("gms.saldanha@outlook.com", "Admin@2026")
PWD = "Senha@123"
RUN = uuid.uuid4().hex[:6].upper()


def d(days):
    return (date.today() + timedelta(days=days)).isoformat()


_tokens = {}


def tok(email, pwd=PWD):
    if email not in _tokens:
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": pwd})
        assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
        _tokens[email] = r.json()["token"]
    return _tokens[email]


def H(email, pwd=PWD):
    return {"Authorization": f"Bearer {tok(email, pwd)}"}


def admin():
    return H(*ADMIN)


@pytest.fixture(scope="session")
def setores():
    r = requests.get(f"{API}/setores", headers=admin())
    assert r.status_code == 200
    return {s["nome"]: s for s in r.json()}


@pytest.fixture(scope="session")
def produtos():
    r = requests.get(f"{API}/produtos", headers=admin())
    assert r.status_code == 200
    return {p["codigo"]: p for p in r.json()}


@pytest.fixture(scope="session")
def test_prod():
    """TEST_ medicamento product with two lots for FEFO tests"""
    r = requests.post(f"{API}/produtos", headers=admin(), json={
        "codigo": f"TEST_{RUN}", "descricao": f"TEST_Med {RUN}", "categoria": "medicamento", "unidade": "UN",
        "estoque_minimo": 5, "estoque_maximo": 100})
    assert r.status_code == 200, r.text
    return r.json()


# ---------- Auth ----------
class TestAuth:
    @pytest.mark.parametrize("email", ["gestor@hospital.gov.br", "farmaceutico@hospital.gov.br", "estoquista@hospital.gov.br",
                                       "comprador@hospital.gov.br", "enfermagem.uti@hospital.gov.br", "administrativo@hospital.gov.br",
                                       "ccih@hospital.gov.br", "auditor@hospital.gov.br"])
    def test_seeded_login(self, email):
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": PWD})
        assert r.status_code == 200
        assert r.json()["user"]["email"] == email
        assert "password_hash" not in r.json()["user"]

    def test_admin_login_and_cookie(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN[0], "password": ADMIN[1]})
        assert r.status_code == 200 and r.json()["user"]["role"] == "admin"
        sc = r.headers.get("set-cookie", "")
        assert "access_token" in sc and "HttpOnly" in sc

    def test_wrong_password(self):
        r = requests.post(f"{API}/auth/login", json={"email": "auditor@hospital.gov.br", "password": "errada"})
        assert r.status_code == 401
        assert "incorretos" in r.json()["detail"]

    def test_me(self):
        r = requests.get(f"{API}/auth/me", headers=H("gestor@hospital.gov.br"))
        assert r.status_code == 200 and r.json()["role"] == "gestor"

    def test_no_token(self):
        assert requests.get(f"{API}/dashboard").status_code == 401


# ---------- RBAC ----------
class TestRBAC:
    def test_auditor_saida_403(self, setores, produtos):
        r = requests.post(f"{API}/saidas", headers=H("auditor@hospital.gov.br"), json={
            "setor_id": setores["Administrativo"]["id"], "produto_id": produtos["ESC-001"]["id"], "quantidade": 1})
        assert r.status_code == 403

    def test_solicitante_dashboard_403(self):
        assert requests.get(f"{API}/dashboard", headers=H("enfermagem.uti@hospital.gov.br")).status_code == 403

    def test_non_admin_users_403(self):
        assert requests.get(f"{API}/users", headers=H("gestor@hospital.gov.br")).status_code == 403

    def test_auditor_entrada_403(self, produtos):
        r = requests.post(f"{API}/entradas", headers=H("auditor@hospital.gov.br"), json={
            "produto_id": produtos["ESC-001"]["id"], "lote_numero": "X", "validade": d(100), "quantidade": 1, "custo_unitario": 1})
        assert r.status_code == 403

    def test_estoquista_cannot_block_lote(self):
        lotes = requests.get(f"{API}/lotes", headers=admin()).json()
        r = requests.post(f"{API}/lotes/{lotes[0]['id']}/status", headers=H("estoquista@hospital.gov.br"),
                          json={"status": "bloqueado", "motivo": "x"})
        assert r.status_code == 403


# ---------- Dashboard ----------
class TestDashboard:
    def test_kpis(self):
        r = requests.get(f"{API}/dashboard", headers=H("gestor@hospital.gov.br"))
        assert r.status_code == 200
        j = r.json()
        for k in ("valor_total_estoque", "valor_em_risco", "lotes_em_risco", "faixas", "itens_abaixo_minimo",
                  "valor_por_categoria", "consumo_por_setor", "lotes_risco"):
            assert k in j
        assert set(j["faixas"]) == {"vencido", "risco_30", "risco_60", "risco_90", "bloqueado"}
        assert j["valor_total_estoque"] > 0
        assert j["faixas"]["vencido"]["qtd_lotes"] >= 1


# ---------- Entrada / custo médio / Saída FEFO ----------
class TestEntradaSaida:
    def test_entrada_custo_medio(self, test_prod):
        h = H("estoquista@hospital.gov.br")
        r1 = requests.post(f"{API}/entradas", headers=h, json={"produto_id": test_prod["id"], "lote_numero": f"TEST_A{RUN}",
                                                              "validade": d(200), "quantidade": 10, "custo_unitario": 10})
        assert r1.status_code == 200, r1.text
        r2 = requests.post(f"{API}/entradas", headers=h, json={"produto_id": test_prod["id"], "lote_numero": f"TEST_B{RUN}",
                                                              "validade": d(50), "quantidade": 30, "custo_unitario": 20})
        assert r2.status_code == 200
        p = [x for x in requests.get(f"{API}/produtos", headers=h).json() if x["id"] == test_prod["id"]][0]
        assert abs(p["custo_medio"] - 17.5) < 0.01
        assert p["saldo_fisico"] == 40

    def test_entrada_vencida_rejeitada(self, test_prod):
        r = requests.post(f"{API}/entradas", headers=admin(), json={"produto_id": test_prod["id"], "lote_numero": "TEST_V",
                                                                   "validade": d(-1), "quantidade": 1, "custo_unitario": 1})
        assert r.status_code == 400

    def test_fefo_preview_earliest(self, test_prod):
        r = requests.get(f"{API}/fefo/{test_prod['id']}?quantidade=5", headers=admin())
        assert r.status_code == 200
        assert r.json()["alocacao"][0]["lote_numero"] == f"TEST_B{RUN}"

    def test_saida_requires_leito(self, setores, test_prod):
        r = requests.post(f"{API}/saidas", headers=admin(), json={"setor_id": setores["UTI Adulto"]["id"],
                                                                 "produto_id": test_prod["id"], "quantidade": 1})
        assert r.status_code == 400 and "leito" in r.json()["detail"]

    def test_saida_categoria_nao_permitida(self, setores, test_prod):
        r = requests.post(f"{API}/saidas", headers=admin(), json={"setor_id": setores["Administrativo"]["id"],
                                                                 "produto_id": test_prod["id"], "quantidade": 1})
        assert r.status_code == 400

    def test_saida_fefo_split_and_insufficient(self, setores, test_prod):
        leitos = requests.get(f"{API}/leitos?setor_id={setores['UTI Adulto']['id']}", headers=admin()).json()
        body = {"setor_id": setores["UTI Adulto"]["id"], "leito_id": leitos[0]["id"], "produto_id": test_prod["id"], "quantidade": 35}
        r = requests.post(f"{API}/saidas", headers=H("farmaceutico@hospital.gov.br"), json=body)
        assert r.status_code == 200, r.text
        movs = r.json()
        assert [m["lote_numero"] for m in movs] == [f"TEST_B{RUN}", f"TEST_A{RUN}"]
        assert [m["quantidade"] for m in movs] == [30, 5]
        assert movs[0]["leito_codigo"] == leitos[0]["codigo"]
        body["quantidade"] = 100
        r = requests.post(f"{API}/saidas", headers=admin(), json=body)
        assert r.status_code == 400 and "insuficiente" in r.json()["detail"]

    def test_saida_leito_outro_setor(self, setores, test_prod):
        leitos = requests.get(f"{API}/leitos?setor_id={setores['Clínica Médica']['id']}", headers=admin()).json()
        r = requests.post(f"{API}/saidas", headers=admin(), json={"setor_id": setores["UTI Adulto"]["id"], "leito_id": leitos[0]["id"],
                                                                 "produto_id": test_prod["id"], "quantidade": 1})
        assert r.status_code == 400

    def test_expired_lot_never_used(self, produtos):
        # MED-005 has an expired lot (-5d) and a valid lot (55d)
        r = requests.get(f"{API}/fefo/{produtos['MED-005']['id']}?quantidade=1", headers=admin()).json()
        assert all(a["validade"] >= date.today().isoformat() for a in r["alocacao"])


# ---------- Lotes block / baixa ----------
class TestLotes:
    def test_block_liberar_baixa(self, test_prod):
        lotes = requests.get(f"{API}/lotes?produto_id={test_prod['id']}", headers=admin()).json()
        lt = [x for x in lotes if x["numero"] == f"TEST_A{RUN}"][0]
        assert lt["fefo_proximo"] is True
        h = H("farmaceutico@hospital.gov.br")
        assert requests.post(f"{API}/lotes/{lt['id']}/status", headers=h, json={"status": "bloqueado", "motivo": "TEST"}).status_code == 200
        f = requests.get(f"{API}/fefo/{test_prod['id']}?quantidade=1", headers=h).json()
        assert f["disponivel"] == 0 and f["suficiente"] is False
        assert requests.post(f"{API}/lotes/{lt['id']}/status", headers=h, json={"status": "liberado", "motivo": "TEST"}).status_code == 200
        r = requests.post(f"{API}/lotes/{lt['id']}/baixa", headers=h, json={"quantidade": 1, "motivo": "TEST quebra"})
        assert r.status_code == 200
        movs = requests.get(f"{API}/movimentos?tipo=perda&produto_id={test_prod['id']}", headers=admin()).json()
        assert any(m["quantidade"] == 1 for m in movs)
        r = requests.post(f"{API}/lotes/{lt['id']}/baixa", headers=h, json={"quantidade": 9999, "motivo": "x"})
        assert r.status_code == 400


# ---------- Devolução ----------
class TestDevolucao:
    def test_devolucao_integro_avariado_excede(self, test_prod):
        movs = requests.get(f"{API}/movimentos?tipo=saida&produto_id={test_prod['id']}", headers=admin()).json()
        m = [x for x in movs if x["lote_numero"] == f"TEST_B{RUN}"][0]  # qty 30
        lotes_before = {x["numero"]: x["quantidade"] for x in requests.get(f"{API}/lotes?produto_id={test_prod['id']}", headers=admin()).json()}
        h = H("estoquista@hospital.gov.br")
        r = requests.post(f"{API}/devolucoes", headers=h, json={"movimento_id": m["id"], "quantidade": 4, "condicao": "integro", "motivo": "TEST"})
        assert r.status_code == 200 and r.json()["tipo"] == "devolucao"
        lotes_after = {x["numero"]: x["quantidade"] for x in requests.get(f"{API}/lotes?produto_id={test_prod['id']}", headers=admin()).json()}
        assert lotes_after[f"TEST_B{RUN}"] == lotes_before.get(f"TEST_B{RUN}", 0) + 4
        r = requests.post(f"{API}/devolucoes", headers=h, json={"movimento_id": m["id"], "quantidade": 2, "condicao": "avariado", "motivo": "TEST"})
        assert r.status_code == 200 and r.json()["tipo"] == "perda"
        r = requests.post(f"{API}/devolucoes", headers=h, json={"movimento_id": m["id"], "quantidade": 25, "condicao": "integro", "motivo": "TEST"})
        assert r.status_code == 400


# ---------- Solicitações ----------
class TestSolicitacoes:
    def test_admin_setor_restrictions(self, produtos):
        h = H("administrativo@hospital.gov.br")
        r = requests.post(f"{API}/solicitacoes", headers=h, json={"itens": [{"produto_id": produtos["MED-001"]["id"], "quantidade": 1}]})
        assert r.status_code == 403
        lst = requests.get(f"{API}/solicitacoes/produtos", headers=h).json()["produtos"]
        allowed = {p["categoria"] for p in lst if p["permitido"]}
        assert allowed == {"escritorio", "higiene_limpeza"}

    def test_ccih_restrictions(self, produtos):
        h = H("ccih@hospital.gov.br")
        for cod in ("MED-001", "MAT-001"):
            r = requests.post(f"{API}/solicitacoes", headers=h, json={"itens": [{"produto_id": produtos[cod]["id"], "quantidade": 1}]})
            assert r.status_code == 403
        r = requests.post(f"{API}/solicitacoes", headers=h, json={"itens": [{"produto_id": produtos["EPI-002"]["id"], "quantidade": 1}],
                                                                  "observacao": "TEST_ccih"})
        assert r.status_code == 200
        c = requests.post(f"{API}/solicitacoes/{r.json()['id']}/cancelar", headers=h)
        assert c.status_code == 200 and c.json()["status"] == "cancelada"

    def test_uti_leito_required_and_flow(self, setores, produtos):
        h = H("enfermagem.uti@hospital.gov.br")
        r = requests.post(f"{API}/solicitacoes", headers=h, json={"itens": [{"produto_id": produtos["MAT-001"]["id"], "quantidade": 2}]})
        assert r.status_code == 400
        leitos = requests.get(f"{API}/leitos?setor_id={setores['UTI Adulto']['id']}", headers=h).json()
        r = requests.post(f"{API}/solicitacoes", headers=h, json={"observacao": "TEST_uti", "itens": [
            {"produto_id": produtos["MAT-001"]["id"], "quantidade": 2, "leito_id": leitos[1]["id"]}]})
        assert r.status_code == 200
        sid = r.json()["id"]
        # other user cannot cancel
        assert requests.post(f"{API}/solicitacoes/{sid}/cancelar", headers=H("ccih@hospital.gov.br")).status_code == 403
        a = requests.post(f"{API}/solicitacoes/{sid}/aprovar", headers=H("gestor@hospital.gov.br"))
        assert a.status_code == 200 and a.json()["status"] == "aprovada"
        t = requests.post(f"{API}/solicitacoes/{sid}/atender", headers=H("estoquista@hospital.gov.br"))
        assert t.status_code == 200 and t.json()["status"] == "atendida"
        movs = requests.get(f"{API}/movimentos?tipo=saida&produto_id={produtos['MAT-001']['id']}", headers=admin()).json()
        assert any(m.get("ref_id") == sid and m["leito_codigo"] == leitos[1]["codigo"] for m in movs)

    def test_cannot_approve_own_and_reject(self, produtos):
        h = H("farmaceutico@hospital.gov.br")
        r = requests.post(f"{API}/solicitacoes", headers=h, json={"observacao": "TEST_own", "itens": [
            {"produto_id": produtos["ESC-002"]["id"], "quantidade": 1}]})
        assert r.status_code == 200
        sid = r.json()["id"]
        assert requests.post(f"{API}/solicitacoes/{sid}/aprovar", headers=h).status_code == 403
        rj = requests.post(f"{API}/solicitacoes/{sid}/rejeitar", headers=H("gestor@hospital.gov.br"), json={"motivo": "TEST"})
        assert rj.status_code == 200 and rj.json()["status"] == "rejeitada"

    def test_solicitante_only_sees_own_setor(self, setores):
        lst = requests.get(f"{API}/solicitacoes", headers=H("ccih@hospital.gov.br")).json()
        assert all(s["setor_id"] == setores["CCIH"]["id"] for s in lst)


# ---------- Compras ----------
class TestCompras:
    def test_full_flow(self, produtos):
        sug = requests.get(f"{API}/compras/sugestao", headers=H("comprador@hospital.gov.br"))
        assert sug.status_code == 200 and isinstance(sug.json(), list)
        hc = H("comprador@hospital.gov.br")
        forn = f"TEST_Forn {RUN}"
        r = requests.post(f"{API}/compras", headers=hc, json={"fornecedor": forn, "itens": [
            {"produto_id": produtos["ESC-002"]["id"], "quantidade": 5, "preco_estimado": 40}]})
        assert r.status_code == 200 and r.json()["valor_total"] == 200
        cid = r.json()["id"]
        assert requests.post(f"{API}/compras/{cid}/aprovar", headers=hc).status_code == 403
        assert requests.post(f"{API}/compras/{cid}/aprovar", headers=H("gestor@hospital.gov.br")).json()["status"] == "aprovado"
        he = H("estoquista@hospital.gov.br")
        rec = requests.post(f"{API}/compras/{cid}/receber", headers=he, json={"nota_fiscal": f"TEST_NF{RUN}", "itens": [
            {"produto_id": produtos["ESC-002"]["id"], "lote_numero": f"TEST_L{RUN}", "validade": d(500), "quantidade": 5, "custo_unitario": 40}]})
        assert rec.status_code == 200 and rec.json()["status"] == "recebido"
        lotes = requests.get(f"{API}/lotes?produto_id={produtos['ESC-002']['id']}", headers=admin()).json()
        assert any(lt["numero"] == f"TEST_L{RUN}" for lt in lotes)
        # duplicate NF on a second order
        r2 = requests.post(f"{API}/compras", headers=hc, json={"fornecedor": forn, "itens": [
            {"produto_id": produtos["ESC-002"]["id"], "quantidade": 1, "preco_estimado": 40}]})
        cid2 = r2.json()["id"]
        requests.post(f"{API}/compras/{cid2}/aprovar", headers=H("gestor@hospital.gov.br"))
        dup = requests.post(f"{API}/compras/{cid2}/receber", headers=he, json={"nota_fiscal": f"TEST_NF{RUN}", "itens": [
            {"produto_id": produtos["ESC-002"]["id"], "lote_numero": "TEST_X", "validade": d(500), "quantidade": 1, "custo_unitario": 40}]})
        assert dup.status_code == 400

    def test_solicitante_cannot_view_compras(self):
        assert requests.get(f"{API}/compras", headers=H("ccih@hospital.gov.br")).status_code == 403


# ---------- Auditoria ----------
class TestAuditoria:
    def test_access(self):
        assert requests.get(f"{API}/auditoria", headers=H("auditor@hospital.gov.br")).status_code == 200
        assert requests.get(f"{API}/auditoria", headers=H("estoquista@hospital.gov.br")).status_code == 403

    def test_filters(self):
        r = requests.get(f"{API}/auditoria?acao=entrada&busca=TEST_", headers=admin()).json()
        assert len(r) >= 1 and all(x["acao"] == "entrada" for x in r)
        m = requests.get(f"{API}/movimentos?lote=TEST_A{RUN}", headers=H("auditor@hospital.gov.br")).json()
        assert len(m) >= 1 and all(x["lote_numero"] == f"TEST_A{RUN}" for x in m)


# ---------- Admin ----------
class TestAdmin:
    def test_user_setor_leito(self, setores):
        r = requests.post(f"{API}/users", headers=admin(), json={"email": f"test_{RUN.lower()}@x.com", "nome": "TEST_User",
                                                                 "role": "auditor", "password": "Teste@123"})
        assert r.status_code == 200 and "password_hash" not in r.json()
        assert requests.post(f"{API}/auth/login", json={"email": f"test_{RUN.lower()}@x.com", "password": "Teste@123"}).status_code == 200
        dup = requests.post(f"{API}/users", headers=admin(), json={"email": f"test_{RUN.lower()}@x.com", "nome": "x", "role": "auditor", "password": "Teste@123"})
        assert dup.status_code == 400
        s = setores["CCIH"]
        upd = requests.put(f"{API}/setores/{s['id']}", headers=admin(), json={"nome": s["nome"], "tipo": s["tipo"],
                                                                               "categorias_permitidas": s["categorias_permitidas"], "ativo": True})
        assert upd.status_code == 200 and upd.json()["categorias_permitidas"] == s["categorias_permitidas"]
        lr = requests.post(f"{API}/leitos", headers=admin(), json={"codigo": f"TEST-{RUN}", "setor_id": setores["Pronto Socorro"]["id"]})
        assert lr.status_code == 200
        assert requests.post(f"{API}/leitos", headers=admin(), json={"codigo": f"TEST-{RUN}", "setor_id": setores["Pronto Socorro"]["id"]}).status_code == 400

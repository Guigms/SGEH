# SGEH edge cases: atender with duplicated product items (partial saída), brute-force lockout
import os
import uuid
import requests

API = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/") + "/api"


def H(e, p="Senha@123"):
    return {"Authorization": "Bearer " + requests.post(f"{API}/auth/login", json={"email": e, "password": p}).json()["token"]}


def test_atender_duplicate_items_partial():
    adm = H("gms.saldanha@outlook.com", "Admin@2026")
    prods = {p["codigo"]: p for p in requests.get(f"{API}/produtos", headers=adm).json()}
    p = prods["HIG-002"]
    disp = p["saldo_disponivel"]
    q = int(disp * 0.6)
    uti = H("enfermagem.uti@hospital.gov.br")
    r = requests.post(f"{API}/solicitacoes", headers=uti, json={"observacao": "TEST_dup", "itens": [
        {"produto_id": p["id"], "quantidade": q}, {"produto_id": p["id"], "quantidade": q}]})
    assert r.status_code == 200, r.text
    sid = r.json()["id"]
    requests.post(f"{API}/solicitacoes/{sid}/aprovar", headers=H("gestor@hospital.gov.br"))
    t = requests.post(f"{API}/solicitacoes/{sid}/atender", headers=H("estoquista@hospital.gov.br"))
    after = [x for x in requests.get(f"{API}/produtos", headers=adm).json() if x["id"] == p["id"]][0]["saldo_disponivel"]
    print("atender status", t.status_code, t.text[:200], "saldo before", disp, "after", after)
    # cleanup: reject
    requests.post(f"{API}/solicitacoes/{sid}/rejeitar", headers=adm, json={"motivo": "TEST cleanup"})
    assert not (t.status_code != 200 and after != disp), "Partial saída applied while atender failed"


def test_lockout():
    e = f"test_lock_{uuid.uuid4().hex[:5]}@x.com"
    codes = [requests.post(f"{API}/auth/login", json={"email": e, "password": "bad"}).status_code for _ in range(6)]
    assert codes[:5] == [401] * 5 and codes[5] == 429, codes

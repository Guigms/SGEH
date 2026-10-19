import os
import random
from datetime import date, timedelta, datetime, timezone
from core import db, new_id, now_iso, hash_password, verify_password, registrar_entrada, registrar_saida, CATEGORIAS

ALL = list(CATEGORIAS.keys())

SETORES = [
    ("Farmácia Central / Almoxarifado", "estoque", ALL, []),
    ("UTI Adulto", "assistencial", ALL, [f"UTI-{i:02d}" for i in range(1, 9)]),
    ("Clínica Médica", "assistencial", ALL, [f"CM-{100 + i}" for i in range(1, 11)]),
    ("Pronto Socorro", "assistencial", ALL, [f"PS-{i:02d}" for i in range(1, 7)]),
    ("Administrativo", "administrativo", ["escritorio", "higiene_limpeza"], []),
    ("CCIH", "apoio", ["epi", "higiene_limpeza", "escritorio"], []),
]

PRODUTOS = [
    ("MED-001", "Dipirona 500mg/ml ampola 2ml", "medicamento", "AMP", 200, 800, 1.35),
    ("MED-002", "Soro Fisiológico 0,9% 500ml", "medicamento", "FR", 300, 1200, 4.80),
    ("MED-003", "Ceftriaxona 1g frasco-ampola", "medicamento", "FA", 100, 400, 9.90),
    ("MED-004", "Omeprazol 40mg injetável", "medicamento", "FA", 80, 300, 12.50),
    ("MED-005", "Heparina 5.000UI/0,25ml", "medicamento", "AMP", 60, 250, 18.70),
    ("MAT-001", "Seringa descartável 10ml", "material_assistencial", "UN", 500, 2000, 0.62),
    ("MAT-002", "Cateter intravenoso 20G", "material_assistencial", "UN", 200, 800, 2.10),
    ("MAT-003", "Equipo macrogotas", "material_assistencial", "UN", 300, 1000, 3.40),
    ("MAT-004", "Gaze estéril 7,5x7,5 (pct 10)", "material_assistencial", "PCT", 200, 900, 1.15),
    ("EPI-001", "Luva de procedimento M (cx 100)", "epi", "CX", 100, 400, 32.00),
    ("EPI-002", "Máscara N95/PFF2", "epi", "UN", 150, 600, 3.90),
    ("HIG-001", "Álcool em gel 70% 500ml", "higiene_limpeza", "FR", 80, 300, 8.90),
    ("HIG-002", "Papel toalha interfolhado (pct)", "higiene_limpeza", "PCT", 100, 400, 6.40),
    ("ESC-001", "Papel A4 75g (resma)", "escritorio", "RESMA", 40, 150, 27.50),
    ("ESC-002", "Caneta esferográfica azul (cx 50)", "escritorio", "CX", 10, 40, 38.00),
]

LOTES = {
    "MED-001": [(-12, 120), (25, 300), (210, 400)],
    "MED-002": [(48, 500), (320, 600)],
    "MED-003": [(18, 60), (75, 120)],
    "MED-004": [(140, 90)],
    "MED-005": [(-5, 30), (55, 40)],
    "MAT-001": [(400, 1500)],
    "MAT-002": [(85, 180), (500, 300)],
    "MAT-003": [(28, 200), (365, 400)],
    "MAT-004": [(240, 150)],
    "EPI-001": [(70, 160)],
    "EPI-002": [(-30, 40), (300, 250)],
    "HIG-001": [(42, 90), (260, 120)],
    "HIG-002": [(700, 300)],
    "ESC-001": [(900, 30)],
    "ESC-002": [(900, 25)],
}

USERS = [
    ("gestor@hospital.gov.br", "Marina Lopes", "gestor", "Farmácia Central / Almoxarifado"),
    ("farmaceutico@hospital.gov.br", "Dr. Paulo Reis", "farmaceutico", "Farmácia Central / Almoxarifado"),
    ("estoquista@hospital.gov.br", "Carlos Souza", "estoquista", "Farmácia Central / Almoxarifado"),
    ("comprador@hospital.gov.br", "Fernanda Lima", "comprador", "Farmácia Central / Almoxarifado"),
    ("enfermagem.uti@hospital.gov.br", "Enf. Juliana Alves", "solicitante", "UTI Adulto"),
    ("administrativo@hospital.gov.br", "Roberto Dias", "solicitante", "Administrativo"),
    ("ccih@hospital.gov.br", "Dra. Ana CCIH", "solicitante", "CCIH"),
    ("auditor@hospital.gov.br", "Luís Auditor", "auditor", "Farmácia Central / Almoxarifado"),
]


async def seed_admin():
    email = os.environ["ADMIN_EMAIL"].lower()
    pwd = os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"email": email})
    if existing is None:
        await db.users.insert_one({"id": new_id(), "email": email, "nome": "Administrador", "role": "admin",
                                   "setor_id": None, "ativo": True, "password_hash": hash_password(pwd), "created_at": now_iso()})
    elif not verify_password(pwd, existing["password_hash"]):
        await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_password(pwd)}})


async def seed_data():
    if await db.setores.count_documents({}) > 0:
        return
    setores = {}
    for nome, tipo, cats, leitos in SETORES:
        s = {"id": new_id(), "nome": nome, "tipo": tipo, "categorias_permitidas": cats, "ativo": True, "created_at": now_iso()}
        await db.setores.insert_one(dict(s))
        setores[nome] = s
        for cod in leitos:
            await db.leitos.insert_one({"id": new_id(), "codigo": cod, "setor_id": s["id"], "ativo": True, "created_at": now_iso()})
    central = setores["Farmácia Central / Almoxarifado"]
    await db.users.update_one({"email": os.environ["ADMIN_EMAIL"].lower()}, {"$set": {"setor_id": central["id"]}})
    for email, nome, role, setor in USERS:
        if not await db.users.find_one({"email": email}):
            await db.users.insert_one({"id": new_id(), "email": email, "nome": nome, "role": role, "setor_id": setores[setor]["id"],
                                       "ativo": True, "password_hash": hash_password("Senha@123"), "created_at": now_iso()})
    sistema = {"id": "sistema", "nome": "Carga inicial"}
    produtos = {}
    for cod, desc, cat, un, mn, mx, custo in PRODUTOS:
        p = {"id": new_id(), "codigo": cod, "descricao": desc, "categoria": cat, "unidade": un, "estoque_minimo": mn,
             "estoque_maximo": mx, "custo_medio": 0, "ultimo_custo": 0, "ativo": True, "created_at": now_iso()}
        await db.produtos.insert_one(dict(p))
        produtos[cod] = p
        for i, (dias, qtd) in enumerate(LOTES[cod]):
            p = await db.produtos.find_one({"id": p["id"]}, {"_id": 0})
            val = (date.today() + timedelta(days=dias)).isoformat()
            await registrar_entrada(sistema, p, f"L{cod[-3:]}{2026 + i}{random.randint(10, 99)}", val, qtd,
                                    round(custo * random.uniform(0.95, 1.05), 2), "Fornecedor Licitado", "NF carga inicial")
    leitos_uti = await db.leitos.find({"setor_id": setores["UTI Adulto"]["id"]}, {"_id": 0}).to_list(50)
    leitos_cm = await db.leitos.find({"setor_id": setores["Clínica Médica"]["id"]}, {"_id": 0}).to_list(50)
    consumos = [("UTI Adulto", leitos_uti, ["MED-001", "MED-002", "MAT-001", "MAT-003", "MED-003"]),
                ("Clínica Médica", leitos_cm, ["MED-002", "MAT-001", "MAT-004", "MED-004"])]
    for setor_nome, leitos, cods in consumos:
        for _ in range(10):
            cod = random.choice(cods)
            p = await db.produtos.find_one({"id": produtos[cod]["id"]}, {"_id": 0})
            movs = await registrar_saida(sistema, p, random.randint(3, 15), setores[setor_nome], random.choice(leitos), "Consumo assistencial")
            past = (datetime.now(timezone.utc) - timedelta(days=random.randint(1, 28))).isoformat()
            for m in movs:
                await db.movimentos.update_one({"id": m["id"]}, {"$set": {"created_at": past}})
    p = await db.produtos.find_one({"id": produtos["ESC-001"]["id"]}, {"_id": 0})
    await registrar_saida(sistema, p, 8, setores["Administrativo"], None, "Reposição setor")


async def run_seed():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.produtos.create_index("codigo", unique=True)
    await db.lotes.create_index([("produto_id", 1), ("validade", 1)])
    await db.movimentos.create_index("created_at")
    await db.auditoria.create_index("created_at")
    await seed_admin()
    await seed_data()

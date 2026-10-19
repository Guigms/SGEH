from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import uuid
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta, date
from fastapi import HTTPException, Request, Depends
from motor.motor_asyncio import AsyncIOMotorClient

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]
JWT_ALG = "HS256"

ROLES = {
    "admin": "Administrador",
    "gestor": "Gestor / Aprovador",
    "farmaceutico": "Farmacêutico",
    "estoquista": "Estoquista / Almoxarife",
    "comprador": "Comprador",
    "solicitante": "Solicitante do Setor",
    "auditor": "Auditor (somente leitura)",
}
CATEGORIAS = {
    "medicamento": "Medicamento",
    "material_assistencial": "Material Assistencial",
    "epi": "EPI",
    "higiene_limpeza": "Higiene e Limpeza",
    "escritorio": "Material de Escritório",
}
CATEGORIAS_ASSISTENCIAIS = {"medicamento", "material_assistencial"}
STOCK = {"admin", "farmaceutico", "estoquista"}
PERMS = {
    "ver_estoque": {"admin", "gestor", "farmaceutico", "estoquista", "comprador", "auditor"},
    "produtos_write": STOCK,
    "entrada": STOCK,
    "saida": STOCK,
    "devolucao": STOCK,
    "lote_status": {"admin", "farmaceutico"},
    "baixa": {"admin", "farmaceutico"},
    "solicitar": {"admin", "gestor", "farmaceutico", "estoquista", "comprador", "solicitante"},
    "aprovar_solicitacao": {"admin", "gestor", "farmaceutico"},
    "atender_solicitacao": STOCK,
    "compra_ver": {"admin", "gestor", "comprador", "farmaceutico", "estoquista", "auditor"},
    "compra_criar": {"admin", "gestor", "comprador"},
    "compra_aprovar": {"admin", "gestor"},
    "compra_receber": STOCK,
    "auditoria": {"admin", "gestor", "auditor"},
    "admin": {"admin"},
}


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def today_str():
    return date.today().isoformat()


def days_until(validade: str) -> int:
    return (date.fromisoformat(validade) - date.today()).days


def new_id():
    return str(uuid.uuid4())


def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def verify_password(p: str, h: str) -> bool:
    return bcrypt.checkpw(p.encode(), h.encode())


def create_token(user_id: str) -> str:
    payload = {"sub": user_id, "type": "access", "exp": datetime.now(timezone.utc) + timedelta(hours=10)}
    return jwt.encode(payload, os.environ["JWT_SECRET"], algorithm=JWT_ALG)


def public_user(u: dict) -> dict:
    return {k: v for k, v in u.items() if k not in ("_id", "password_hash")}


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
    if not token:
        raise HTTPException(401, "Não autenticado")
    try:
        payload = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=[JWT_ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Sessão expirada")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Token inválido")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user or not user.get("ativo", True):
        raise HTTPException(401, "Usuário inválido ou inativo")
    return user


def require(perm: str):
    async def dep(user: dict = Depends(get_current_user)):
        if user["role"] not in PERMS[perm]:
            raise HTTPException(403, "Seu perfil não tem permissão para esta ação")
        return user
    return dep


async def audit(user: dict, acao: str, entidade: str, entidade_id: str, detalhes: str):
    await db.auditoria.insert_one({
        "id": new_id(), "usuario_id": user.get("id"), "usuario_nome": user.get("nome"),
        "role": user.get("role"), "acao": acao, "entidade": entidade, "entidade_id": entidade_id,
        "detalhes": detalhes, "created_at": now_iso(),
    })


def lote_situacao(lote: dict) -> str:
    if lote["status"] == "bloqueado":
        return "bloqueado"
    d = days_until(lote["validade"])
    if d < 0:
        return "vencido"
    if d <= 30:
        return "risco_30"
    if d <= 60:
        return "risco_60"
    if d <= 90:
        return "risco_90"
    return "ok"


async def saldo_fisico(produto_id: str) -> float:
    res = await db.lotes.aggregate([
        {"$match": {"produto_id": produto_id}},
        {"$group": {"_id": None, "q": {"$sum": "$quantidade"}}},
    ]).to_list(1)
    return res[0]["q"] if res else 0


async def lotes_elegiveis(produto_id: str) -> list:
    return await db.lotes.find(
        {"produto_id": produto_id, "status": "liberado", "quantidade": {"$gt": 0}, "validade": {"$gte": today_str()}},
        {"_id": 0},
    ).sort([("validade", 1), ("created_at", 1)]).to_list(500)


async def fefo_alocar(produto_id: str, quantidade: float) -> list:
    restante = quantidade
    alocacao = []
    for lote in await lotes_elegiveis(produto_id):
        if restante <= 0:
            break
        q = min(lote["quantidade"], restante)
        alocacao.append({"lote": lote, "quantidade": q})
        restante -= q
    if restante > 0:
        disp = quantidade - restante
        raise HTTPException(400, f"Saldo disponível insuficiente (disponível em lotes válidos: {disp:g})")
    return alocacao


async def registrar_entrada(user, produto, lote_numero, validade, quantidade, custo_unit, fornecedor="", documento="", tipo="entrada", ref_id=None):
    saldo_ant = await saldo_fisico(produto["id"])
    cm_ant = produto.get("custo_medio", 0) or 0
    novo_cm = ((saldo_ant * cm_ant) + (quantidade * custo_unit)) / (saldo_ant + quantidade) if (saldo_ant + quantidade) > 0 else custo_unit
    lote = await db.lotes.find_one({"produto_id": produto["id"], "numero": lote_numero, "validade": validade}, {"_id": 0})
    if lote:
        await db.lotes.update_one({"id": lote["id"]}, {"$inc": {"quantidade": quantidade}})
    else:
        lote = {"id": new_id(), "produto_id": produto["id"], "numero": lote_numero, "validade": validade,
                "quantidade": quantidade, "status": "liberado", "fornecedor": fornecedor, "created_at": now_iso()}
        await db.lotes.insert_one(dict(lote))
    await db.produtos.update_one({"id": produto["id"]}, {"$set": {"custo_medio": round(novo_cm, 4), "ultimo_custo": custo_unit}})
    mov = {"id": new_id(), "tipo": tipo, "produto_id": produto["id"], "produto_descricao": produto["descricao"],
           "categoria": produto["categoria"], "lote_id": lote["id"], "lote_numero": lote_numero, "validade": validade,
           "quantidade": quantidade, "custo_unitario": custo_unit, "valor": round(quantidade * custo_unit, 2),
           "setor_id": None, "setor_nome": None, "leito_id": None, "leito_codigo": None,
           "fornecedor": fornecedor, "documento": documento, "motivo": "", "ref_id": ref_id,
           "usuario_id": user["id"], "usuario_nome": user["nome"], "created_at": now_iso()}
    await db.movimentos.insert_one(dict(mov))
    return mov


async def registrar_saida(user, produto, quantidade, setor, leito=None, motivo="", documento="", ref_id=None):
    alocacao = await fefo_alocar(produto["id"], quantidade)
    feitos = []
    for a in alocacao:
        r = await db.lotes.update_one({"id": a["lote"]["id"], "quantidade": {"$gte": a["quantidade"]}}, {"$inc": {"quantidade": -a["quantidade"]}})
        if r.modified_count == 0:
            for lid, q in feitos:
                await db.lotes.update_one({"id": lid}, {"$inc": {"quantidade": q}})
            raise HTTPException(409, "Saldo alterado por outra operação. Tente novamente.")
        feitos.append((a["lote"]["id"], a["quantidade"]))
    cm = produto.get("custo_medio", 0) or 0
    movs = []
    for a in alocacao:
        movs.append({"id": new_id(), "tipo": "saida", "produto_id": produto["id"], "produto_descricao": produto["descricao"],
                     "categoria": produto["categoria"], "lote_id": a["lote"]["id"], "lote_numero": a["lote"]["numero"],
                     "validade": a["lote"]["validade"], "quantidade": a["quantidade"], "custo_unitario": cm,
                     "valor": round(a["quantidade"] * cm, 2), "setor_id": setor["id"], "setor_nome": setor["nome"],
                     "leito_id": leito["id"] if leito else None, "leito_codigo": leito["codigo"] if leito else None,
                     "fornecedor": "", "documento": documento, "motivo": motivo, "ref_id": ref_id, "devolvido": 0,
                     "usuario_id": user["id"], "usuario_nome": user["nome"], "created_at": now_iso()})
    await db.movimentos.insert_many([dict(m) for m in movs])
    return movs


async def validar_leito(setor: dict, produto: dict, leito_id):
    if leito_id:
        leito = await db.leitos.find_one({"id": leito_id, "setor_id": setor["id"], "ativo": True}, {"_id": 0})
        if not leito:
            raise HTTPException(400, "Leito não pertence ao setor informado")
        return leito
    if setor["tipo"] == "assistencial" and produto["categoria"] in CATEGORIAS_ASSISTENCIAIS:
        raise HTTPException(400, f"'{produto['descricao']}' é item assistencial: informe o leito do setor {setor['nome']}")
    return None

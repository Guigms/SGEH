import os
import logging
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Response
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from core import (db, client, ROLES, CATEGORIAS, CATEGORIAS_ASSISTENCIAIS, PERMS, new_id, now_iso, today_str, days_until,
                  hash_password, verify_password, create_token, public_user, get_current_user, require, audit,
                  lote_situacao, saldo_fisico, lotes_elegiveis, fefo_alocar, registrar_entrada, registrar_saida, validar_leito)
from seed import run_seed

app = FastAPI(title="SGEH - Estoque Hospitalar")
api = APIRouter(prefix="/api")


# ---------- Models ----------
class LoginIn(BaseModel):
    email: str
    password: str


class SetorIn(BaseModel):
    nome: str
    tipo: str = Field(pattern="^(assistencial|administrativo|apoio|estoque)$")
    categorias_permitidas: List[str]
    ativo: bool = True


class LeitoIn(BaseModel):
    codigo: str
    setor_id: str
    ativo: bool = True


class UserIn(BaseModel):
    email: str
    nome: str
    role: str
    setor_id: Optional[str] = None
    password: Optional[str] = None
    ativo: bool = True


class ProdutoIn(BaseModel):
    codigo: str
    descricao: str
    categoria: str
    unidade: str
    estoque_minimo: float = Field(ge=0)
    estoque_maximo: float = Field(ge=0)
    ativo: bool = True


class EntradaIn(BaseModel):
    produto_id: str
    lote_numero: str
    validade: str
    quantidade: float = Field(gt=0)
    custo_unitario: float = Field(ge=0)
    fornecedor: str = ""
    nota_fiscal: str = ""


class SaidaIn(BaseModel):
    setor_id: str
    leito_id: Optional[str] = None
    produto_id: str
    quantidade: float = Field(gt=0)
    motivo: str = ""


class DevolucaoIn(BaseModel):
    movimento_id: str
    quantidade: float = Field(gt=0)
    condicao: str = Field(pattern="^(integro|avariado)$")
    motivo: str


class LoteStatusIn(BaseModel):
    status: str = Field(pattern="^(liberado|bloqueado)$")
    motivo: str


class BaixaIn(BaseModel):
    quantidade: float = Field(gt=0)
    motivo: str


class SolItem(BaseModel):
    produto_id: str
    quantidade: float = Field(gt=0)
    leito_id: Optional[str] = None


class SolicitacaoIn(BaseModel):
    setor_id: Optional[str] = None
    observacao: str = ""
    itens: List[SolItem]


class MotivoIn(BaseModel):
    motivo: str = ""


class CompraItem(BaseModel):
    produto_id: str
    quantidade: float = Field(gt=0)
    preco_estimado: float = Field(ge=0)


class CompraIn(BaseModel):
    fornecedor: str
    observacao: str = ""
    itens: List[CompraItem]


class RecebItem(BaseModel):
    produto_id: str
    lote_numero: str
    validade: str
    quantidade: float = Field(gt=0)
    custo_unitario: float = Field(ge=0)


class RecebimentoIn(BaseModel):
    nota_fiscal: str
    itens: List[RecebItem]


async def next_seq(name: str) -> int:
    r = await db.counters.find_one_and_update({"_id": name}, {"$inc": {"seq": 1}}, upsert=True, return_document=True)
    return r["seq"]


async def get_produto(pid):
    p = await db.produtos.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Produto não encontrado")
    return p


async def get_setor(sid):
    s = await db.setores.find_one({"id": sid}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Setor não encontrado")
    return s


def check_validade(v: str):
    try:
        datetime.strptime(v, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, "Validade inválida (use AAAA-MM-DD)")


# ---------- Auth ----------
@api.post("/auth/login")
async def login(body: LoginIn, response: Response):
    email = body.email.strip().lower()
    ident = f"login:{email}"
    att = await db.login_attempts.find_one({"identifier": ident})
    if att and att.get("count", 0) >= 5:
        if att.get("locked_until", "") > now_iso():
            raise HTTPException(429, "Muitas tentativas. Aguarde 15 minutos.")
        await db.login_attempts.delete_one({"identifier": ident})
        att = None
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not verify_password(body.password, user["password_hash"]):
        cnt = (att or {}).get("count", 0) + 1
        lock = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat() if cnt >= 5 else ""
        await db.login_attempts.update_one({"identifier": ident}, {"$set": {"count": cnt, "locked_until": lock}}, upsert=True)
        raise HTTPException(401, "E-mail ou senha incorretos")
    if not user.get("ativo", True):
        raise HTTPException(403, "Usuário inativo")
    await db.login_attempts.delete_one({"identifier": ident})
    token = create_token(user["id"])
    response.set_cookie("access_token", token, httponly=True, secure=True, samesite="none", max_age=36000, path="/")
    await audit(user, "login", "usuario", user["id"], "Login realizado")
    return {"token": token, "user": public_user(user)}


@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return user


@api.post("/auth/logout")
async def logout(response: Response, user=Depends(get_current_user)):
    response.delete_cookie("access_token", path="/")
    await audit(user, "logout", "usuario", user["id"], "Logout")
    return {"ok": True}


@api.get("/meta")
async def meta(user=Depends(get_current_user)):
    return {"roles": ROLES, "categorias": CATEGORIAS, "categorias_assistenciais": list(CATEGORIAS_ASSISTENCIAIS),
            "perms": {k: sorted(v) for k, v in PERMS.items()}}


# ---------- Setores / Leitos / Usuários ----------
@api.get("/setores")
async def list_setores(user=Depends(get_current_user)):
    return await db.setores.find({}, {"_id": 0}).sort("nome", 1).to_list(500)


@api.post("/setores")
async def create_setor(body: SetorIn, user=Depends(require("admin"))):
    doc = {"id": new_id(), **body.model_dump(), "created_at": now_iso()}
    await db.setores.insert_one(dict(doc))
    await audit(user, "criar_setor", "setor", doc["id"], f"{doc['nome']} ({doc['tipo']}) categorias: {', '.join(doc['categorias_permitidas'])}")
    doc.pop("_id", None)
    return doc


@api.put("/setores/{sid}")
async def update_setor(sid: str, body: SetorIn, user=Depends(require("admin"))):
    await get_setor(sid)
    await db.setores.update_one({"id": sid}, {"$set": body.model_dump()})
    await audit(user, "editar_setor", "setor", sid, f"{body.nome} categorias: {', '.join(body.categorias_permitidas)}")
    return await get_setor(sid)


@api.get("/leitos")
async def list_leitos(setor_id: Optional[str] = None, user=Depends(get_current_user)):
    q = {"setor_id": setor_id} if setor_id else {}
    return await db.leitos.find(q, {"_id": 0}).sort("codigo", 1).to_list(1000)


@api.post("/leitos")
async def create_leito(body: LeitoIn, user=Depends(require("admin"))):
    s = await get_setor(body.setor_id)
    if await db.leitos.find_one({"codigo": body.codigo, "setor_id": body.setor_id}):
        raise HTTPException(400, "Leito já existe neste setor")
    doc = {"id": new_id(), **body.model_dump(), "created_at": now_iso()}
    await db.leitos.insert_one(dict(doc))
    await audit(user, "criar_leito", "leito", doc["id"], f"{body.codigo} - {s['nome']}")
    doc.pop("_id", None)
    return doc


@api.put("/leitos/{lid}")
async def update_leito(lid: str, body: LeitoIn, user=Depends(require("admin"))):
    await db.leitos.update_one({"id": lid}, {"$set": body.model_dump()})
    await audit(user, "editar_leito", "leito", lid, f"{body.codigo} ativo={body.ativo}")
    return await db.leitos.find_one({"id": lid}, {"_id": 0})


@api.get("/users")
async def list_users(user=Depends(require("admin"))):
    return await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("nome", 1).to_list(1000)


@api.post("/users")
async def create_user(body: UserIn, user=Depends(require("admin"))):
    if body.role not in ROLES:
        raise HTTPException(400, "Perfil inválido")
    if not body.password or len(body.password) < 6:
        raise HTTPException(400, "Senha deve ter ao menos 6 caracteres")
    email = body.email.strip().lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "E-mail já cadastrado")
    doc = {"id": new_id(), "email": email, "nome": body.nome, "role": body.role, "setor_id": body.setor_id,
           "ativo": body.ativo, "password_hash": hash_password(body.password), "created_at": now_iso()}
    await db.users.insert_one(dict(doc))
    await audit(user, "criar_usuario", "usuario", doc["id"], f"{email} perfil {body.role}")
    return public_user(doc)


@api.put("/users/{uid}")
async def update_user(uid: str, body: UserIn, user=Depends(require("admin"))):
    if body.role not in ROLES:
        raise HTTPException(400, "Perfil inválido")
    upd = {"nome": body.nome, "role": body.role, "setor_id": body.setor_id, "ativo": body.ativo}
    if body.password:
        upd["password_hash"] = hash_password(body.password)
    await db.users.update_one({"id": uid}, {"$set": upd})
    await audit(user, "editar_usuario", "usuario", uid, f"perfil {body.role} ativo={body.ativo}" + (" (senha alterada)" if body.password else ""))
    return await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})


# ---------- Produtos / Lotes ----------
async def produtos_com_saldo(query: dict):
    produtos = await db.produtos.find(query, {"_id": 0}).sort("descricao", 1).to_list(2000)
    lotes = await db.lotes.find({"quantidade": {"$gt": 0}}, {"_id": 0}).to_list(10000)
    t = today_str()
    for p in produtos:
        pl = [lt for lt in lotes if lt["produto_id"] == p["id"]]
        p["saldo_fisico"] = sum(lt["quantidade"] for lt in pl)
        p["saldo_disponivel"] = sum(lt["quantidade"] for lt in pl if lt["status"] == "liberado" and lt["validade"] >= t)
        p["valor_estoque"] = round(p["saldo_fisico"] * (p.get("custo_medio") or 0), 2)
        p["abaixo_minimo"] = p["saldo_disponivel"] <= p["estoque_minimo"]
    return produtos


@api.get("/produtos")
async def list_produtos(user=Depends(get_current_user)):
    return await produtos_com_saldo({})


@api.post("/produtos")
async def create_produto(body: ProdutoIn, user=Depends(require("produtos_write"))):
    if body.categoria not in CATEGORIAS:
        raise HTTPException(400, "Categoria inválida")
    if body.estoque_minimo > body.estoque_maximo:
        raise HTTPException(400, "Estoque mínimo não pode ser maior que o máximo")
    if await db.produtos.find_one({"codigo": body.codigo}):
        raise HTTPException(400, "Código já cadastrado")
    doc = {"id": new_id(), **body.model_dump(), "custo_medio": 0, "ultimo_custo": 0, "created_at": now_iso()}
    await db.produtos.insert_one(dict(doc))
    await audit(user, "criar_produto", "produto", doc["id"], f"{body.codigo} - {body.descricao}")
    doc.pop("_id", None)
    return doc


@api.put("/produtos/{pid}")
async def update_produto(pid: str, body: ProdutoIn, user=Depends(require("produtos_write"))):
    await get_produto(pid)
    if body.categoria not in CATEGORIAS:
        raise HTTPException(400, "Categoria inválida")
    if body.estoque_minimo > body.estoque_maximo:
        raise HTTPException(400, "Estoque mínimo não pode ser maior que o máximo")
    if await db.produtos.find_one({"codigo": body.codigo, "id": {"$ne": pid}}):
        raise HTTPException(400, "Código já cadastrado")
    await db.produtos.update_one({"id": pid}, {"$set": body.model_dump()})
    await audit(user, "editar_produto", "produto", pid, f"{body.codigo} - {body.descricao}")
    return await get_produto(pid)


@api.get("/lotes")
async def list_lotes(produto_id: Optional[str] = None, user=Depends(require("ver_estoque"))):
    q = {"quantidade": {"$gt": 0}}
    if produto_id:
        q["produto_id"] = produto_id
    lotes = await db.lotes.find(q, {"_id": 0}).sort([("validade", 1), ("created_at", 1)]).to_list(5000)
    produtos = {p["id"]: p for p in await db.produtos.find({}, {"_id": 0}).to_list(2000)}
    fefo_first = {}
    t = today_str()
    for lt in lotes:
        p = produtos.get(lt["produto_id"], {})
        lt["produto_descricao"] = p.get("descricao")
        lt["produto_codigo"] = p.get("codigo")
        lt["categoria"] = p.get("categoria")
        lt["unidade"] = p.get("unidade")
        lt["dias_para_vencer"] = days_until(lt["validade"])
        lt["situacao"] = lote_situacao(lt)
        lt["valor"] = round(lt["quantidade"] * (p.get("custo_medio") or 0), 2)
        elig = lt["status"] == "liberado" and lt["validade"] >= t
        lt["fefo_proximo"] = bool(elig and lt["produto_id"] not in fefo_first)
        if elig:
            fefo_first.setdefault(lt["produto_id"], lt["id"])
    return lotes


@api.post("/lotes/{lid}/status")
async def lote_status(lid: str, body: LoteStatusIn, user=Depends(require("lote_status"))):
    if not body.motivo.strip():
        raise HTTPException(400, "Informe o motivo")
    lt = await db.lotes.find_one({"id": lid}, {"_id": 0})
    if not lt:
        raise HTTPException(404, "Lote não encontrado")
    await db.lotes.update_one({"id": lid}, {"$set": {"status": body.status}})
    await audit(user, "bloquear_lote" if body.status == "bloqueado" else "liberar_lote", "lote", lid, f"Lote {lt['numero']}: {body.motivo}")
    return {"ok": True}


@api.post("/lotes/{lid}/baixa")
async def lote_baixa(lid: str, body: BaixaIn, user=Depends(require("baixa"))):
    if not body.motivo.strip():
        raise HTTPException(400, "Informe o motivo da baixa")
    lt = await db.lotes.find_one({"id": lid}, {"_id": 0})
    if not lt:
        raise HTTPException(404, "Lote não encontrado")
    p = await get_produto(lt["produto_id"])
    r = await db.lotes.update_one({"id": lid, "quantidade": {"$gte": body.quantidade}}, {"$inc": {"quantidade": -body.quantidade}})
    if r.modified_count == 0:
        raise HTTPException(400, "Quantidade maior que o saldo do lote")
    cm = p.get("custo_medio") or 0
    mov = {"id": new_id(), "tipo": "perda", "produto_id": p["id"], "produto_descricao": p["descricao"], "categoria": p["categoria"],
           "lote_id": lid, "lote_numero": lt["numero"], "validade": lt["validade"], "quantidade": body.quantidade,
           "custo_unitario": cm, "valor": round(body.quantidade * cm, 2), "setor_id": None, "setor_nome": None,
           "leito_id": None, "leito_codigo": None, "fornecedor": "", "documento": "", "motivo": body.motivo, "ref_id": None,
           "usuario_id": user["id"], "usuario_nome": user["nome"], "created_at": now_iso()}
    await db.movimentos.insert_one(dict(mov))
    await audit(user, "baixa_perda", "lote", lid, f"Lote {lt['numero']} - {body.quantidade:g} {p['unidade']} ({body.motivo}) R$ {mov['valor']:.2f}")
    return {"ok": True}


@api.get("/fefo/{produto_id}")
async def fefo_preview(produto_id: str, quantidade: float = 1, user=Depends(require("ver_estoque"))):
    p = await get_produto(produto_id)
    elig = await lotes_elegiveis(produto_id)
    disponivel = sum(lt["quantidade"] for lt in elig)
    alocacao = []
    try:
        alocacao = [{"lote_id": a["lote"]["id"], "lote_numero": a["lote"]["numero"], "validade": a["lote"]["validade"],
                     "quantidade": a["quantidade"], "dias_para_vencer": days_until(a["lote"]["validade"])}
                    for a in await fefo_alocar(produto_id, quantidade)]
        ok = True
    except HTTPException:
        ok = False
    return {"produto": p, "disponivel": disponivel, "suficiente": ok, "alocacao": alocacao,
            "lotes": [{"lote_numero": lt["numero"], "validade": lt["validade"], "quantidade": lt["quantidade"]} for lt in elig]}


# ---------- Movimentos ----------
@api.post("/entradas")
async def entrada(body: EntradaIn, user=Depends(require("entrada"))):
    check_validade(body.validade)
    if body.validade < today_str():
        raise HTTPException(400, "Não é permitido dar entrada em lote vencido")
    p = await get_produto(body.produto_id)
    mov = await registrar_entrada(user, p, body.lote_numero.strip(), body.validade, body.quantidade, body.custo_unitario,
                                  body.fornecedor, body.nota_fiscal)
    await audit(user, "entrada", "movimento", mov["id"],
                f"{p['descricao']} lote {mov['lote_numero']} val {body.validade} qtd {body.quantidade:g} x R$ {body.custo_unitario:.2f} NF {body.nota_fiscal}")
    return mov


@api.post("/saidas")
async def saida(body: SaidaIn, user=Depends(require("saida"))):
    p = await get_produto(body.produto_id)
    s = await get_setor(body.setor_id)
    if p["categoria"] not in s["categorias_permitidas"]:
        raise HTTPException(400, f"Setor {s['nome']} não pode receber itens da categoria {CATEGORIAS[p['categoria']]}")
    leito = await validar_leito(s, p, body.leito_id)
    movs = await registrar_saida(user, p, body.quantidade, s, leito, body.motivo)
    lotes_txt = ", ".join(f"{m['lote_numero']} ({m['quantidade']:g})" for m in movs)
    await audit(user, "saida", "movimento", movs[0]["id"],
                f"{p['descricao']} qtd {body.quantidade:g} → {s['nome']}" + (f" leito {leito['codigo']}" if leito else "") + f" | FEFO: {lotes_txt}")
    return movs


@api.get("/movimentos")
async def list_movimentos(tipo: Optional[str] = None, produto_id: Optional[str] = None, setor_id: Optional[str] = None,
                          leito_id: Optional[str] = None, lote: Optional[str] = None, de: Optional[str] = None,
                          ate: Optional[str] = None, limit: int = 300, user=Depends(get_current_user)):
    q = {}
    if user["role"] == "solicitante":
        q["setor_id"] = user.get("setor_id")
    elif user["role"] not in PERMS["ver_estoque"]:
        raise HTTPException(403, "Sem permissão")
    if tipo:
        q["tipo"] = tipo
    if produto_id:
        q["produto_id"] = produto_id
    if setor_id and user["role"] != "solicitante":
        q["setor_id"] = setor_id
    if leito_id:
        q["leito_id"] = leito_id
    if lote:
        q["lote_numero"] = {"$regex": lote, "$options": "i"}
    if de or ate:
        q["created_at"] = {}
        if de:
            q["created_at"]["$gte"] = de
        if ate:
            q["created_at"]["$lte"] = ate + "T23:59:59"
    return await db.movimentos.find(q, {"_id": 0}).sort("created_at", -1).to_list(min(limit, 1000))


@api.post("/devolucoes")
async def devolucao(body: DevolucaoIn, user=Depends(require("devolucao"))):
    if not body.motivo.strip():
        raise HTTPException(400, "Informe o motivo da devolução")
    orig = await db.movimentos.find_one({"id": body.movimento_id, "tipo": "saida"}, {"_id": 0})
    if not orig:
        raise HTTPException(404, "Movimento de saída original não encontrado")
    restante = orig["quantidade"] - orig.get("devolvido", 0)
    if body.quantidade > restante:
        raise HTTPException(400, f"Quantidade excede o saldo devolvível ({restante:g})")
    r = await db.movimentos.update_one({"id": orig["id"], "devolvido": orig.get("devolvido", 0)}, {"$inc": {"devolvido": body.quantidade}})
    if r.modified_count == 0:
        raise HTTPException(409, "Movimento alterado por outra operação. Tente novamente.")
    p = await get_produto(orig["produto_id"])
    integro = body.condicao == "integro"
    if integro:
        saldo_ant = await saldo_fisico(p["id"])
        cm_ant = p.get("custo_medio") or 0
        novo_cm = (saldo_ant * cm_ant + body.quantidade * orig["custo_unitario"]) / (saldo_ant + body.quantidade)
        await db.lotes.update_one({"id": orig["lote_id"]}, {"$inc": {"quantidade": body.quantidade}})
        await db.produtos.update_one({"id": p["id"]}, {"$set": {"custo_medio": round(novo_cm, 4)}})
    mov = {**orig, "id": new_id(), "tipo": "devolucao" if integro else "perda", "quantidade": body.quantidade,
           "valor": round(body.quantidade * orig["custo_unitario"], 2), "motivo": f"{'Devolução íntegra' if integro else 'Devolução avariada (descarte)'}: {body.motivo}",
           "ref_id": orig["id"], "usuario_id": user["id"], "usuario_nome": user["nome"], "created_at": now_iso()}
    mov.pop("devolvido", None)
    await db.movimentos.insert_one(dict(mov))
    await audit(user, "devolucao", "movimento", mov["id"],
                f"{p['descricao']} lote {orig['lote_numero']} qtd {body.quantidade:g} de {orig['setor_nome']}"
                + (f" leito {orig['leito_codigo']}" if orig.get("leito_codigo") else "") + f" - {body.condicao} - ref {orig['id'][:8]}")
    mov.pop("_id", None)
    return mov


# ---------- Solicitações ----------
@api.get("/solicitacoes/produtos")
async def produtos_permitidos(setor_id: Optional[str] = None, user=Depends(require("solicitar"))):
    sid = setor_id if (setor_id and user["role"] != "solicitante") else user.get("setor_id")
    if not sid:
        raise HTTPException(400, "Usuário sem setor vinculado")
    s = await get_setor(sid)
    prods = await produtos_com_saldo({"ativo": True})
    return {"setor": s, "produtos": [{"id": p["id"], "codigo": p["codigo"], "descricao": p["descricao"], "categoria": p["categoria"],
                                      "unidade": p["unidade"], "saldo_disponivel": p["saldo_disponivel"],
                                      "permitido": p["categoria"] in s["categorias_permitidas"]} for p in prods]}


@api.get("/solicitacoes")
async def list_solicitacoes(status: Optional[str] = None, user=Depends(get_current_user)):
    q = {}
    if user["role"] == "solicitante":
        q["setor_id"] = user.get("setor_id")
    if status:
        q["status"] = status
    return await db.solicitacoes.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)


@api.post("/solicitacoes")
async def create_solicitacao(body: SolicitacaoIn, user=Depends(require("solicitar"))):
    if not body.itens:
        raise HTTPException(400, "Adicione ao menos um item")
    sid = body.setor_id if (body.setor_id and user["role"] != "solicitante") else user.get("setor_id")
    if not sid:
        raise HTTPException(400, "Usuário sem setor vinculado")
    s = await get_setor(sid)
    itens = []
    for it in body.itens:
        p = await get_produto(it.produto_id)
        if p["categoria"] not in s["categorias_permitidas"]:
            raise HTTPException(403, f"O setor {s['nome']} não pode solicitar '{p['descricao']}' (categoria {CATEGORIAS[p['categoria']]})")
        leito = await validar_leito(s, p, it.leito_id)
        itens.append({"produto_id": p["id"], "produto_descricao": p["descricao"], "categoria": p["categoria"], "unidade": p["unidade"],
                      "quantidade": it.quantidade, "leito_id": leito["id"] if leito else None, "leito_codigo": leito["codigo"] if leito else None})
    num = await next_seq("solicitacao")
    doc = {"id": new_id(), "numero": f"SOL-{num:05d}", "setor_id": s["id"], "setor_nome": s["nome"], "itens": itens,
           "observacao": body.observacao, "status": "pendente", "solicitante_id": user["id"], "solicitante_nome": user["nome"],
           "aprovador_nome": None, "atendente_nome": None, "motivo_rejeicao": "", "created_at": now_iso(), "historico": [
               {"status": "pendente", "usuario": user["nome"], "data": now_iso()}]}
    await db.solicitacoes.insert_one(dict(doc))
    await audit(user, "criar_solicitacao", "solicitacao", doc["id"], f"{doc['numero']} - {s['nome']} - {len(itens)} item(ns)")
    doc.pop("_id", None)
    return doc


async def get_sol(sid):
    s = await db.solicitacoes.find_one({"id": sid}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Solicitação não encontrada")
    return s


@api.post("/solicitacoes/{sid}/aprovar")
async def aprovar_sol(sid: str, user=Depends(require("aprovar_solicitacao"))):
    s = await get_sol(sid)
    if s["status"] != "pendente":
        raise HTTPException(400, "Solicitação não está pendente")
    if s["solicitante_id"] == user["id"]:
        raise HTTPException(403, "Segregação de funções: você não pode aprovar sua própria solicitação")
    await db.solicitacoes.update_one({"id": sid}, {"$set": {"status": "aprovada", "aprovador_nome": user["nome"]},
                                                   "$push": {"historico": {"status": "aprovada", "usuario": user["nome"], "data": now_iso()}}})
    await audit(user, "aprovar_solicitacao", "solicitacao", sid, s["numero"])
    return await get_sol(sid)


@api.post("/solicitacoes/{sid}/rejeitar")
async def rejeitar_sol(sid: str, body: MotivoIn, user=Depends(require("aprovar_solicitacao"))):
    s = await get_sol(sid)
    if s["status"] not in ("pendente", "aprovada"):
        raise HTTPException(400, "Solicitação não pode ser rejeitada")
    if s["solicitante_id"] == user["id"]:
        raise HTTPException(403, "Segregação de funções: use 'Cancelar' para sua própria solicitação")
    await db.solicitacoes.update_one({"id": sid}, {"$set": {"status": "rejeitada", "motivo_rejeicao": body.motivo},
                                                   "$push": {"historico": {"status": "rejeitada", "usuario": user["nome"], "data": now_iso()}}})
    await audit(user, "rejeitar_solicitacao", "solicitacao", sid, f"{s['numero']}: {body.motivo}")
    return await get_sol(sid)


@api.post("/solicitacoes/{sid}/cancelar")
async def cancelar_sol(sid: str, user=Depends(get_current_user)):
    s = await get_sol(sid)
    if s["solicitante_id"] != user["id"] and user["role"] != "admin":
        raise HTTPException(403, "Somente o solicitante pode cancelar")
    if s["status"] != "pendente":
        raise HTTPException(400, "Apenas solicitações pendentes podem ser canceladas")
    await db.solicitacoes.update_one({"id": sid}, {"$set": {"status": "cancelada"},
                                                   "$push": {"historico": {"status": "cancelada", "usuario": user["nome"], "data": now_iso()}}})
    await audit(user, "cancelar_solicitacao", "solicitacao", sid, s["numero"])
    return await get_sol(sid)


@api.post("/solicitacoes/{sid}/atender")
async def atender_sol(sid: str, user=Depends(require("atender_solicitacao"))):
    s = await get_sol(sid)
    if s["status"] != "aprovada":
        raise HTTPException(400, "Solicitação precisa estar aprovada")
    setor = await get_setor(s["setor_id"])
    totais = {}
    for it in s["itens"]:
        totais[it["produto_id"]] = totais.get(it["produto_id"], 0) + it["quantidade"]
    for pid, q in totais.items():
        elig = await lotes_elegiveis(pid)
        if sum(lt["quantidade"] for lt in elig) < q:
            desc = next(i["produto_descricao"] for i in s["itens"] if i["produto_id"] == pid)
            raise HTTPException(400, f"Saldo insuficiente para '{desc}'")
    r = await db.solicitacoes.update_one({"id": sid, "status": "aprovada"}, {"$set": {"status": "atendendo"}})
    if r.modified_count == 0:
        raise HTTPException(409, "Solicitação já em atendimento")
    feitos = []
    try:
        for it in s["itens"]:
            p = await get_produto(it["produto_id"])
            leito = await db.leitos.find_one({"id": it["leito_id"]}, {"_id": 0}) if it.get("leito_id") else None
            feitos += await registrar_saida(user, p, it["quantidade"], setor, leito, f"Atendimento {s['numero']}", s["numero"], s["id"])
    except HTTPException:
        for m in feitos:
            await db.lotes.update_one({"id": m["lote_id"]}, {"$inc": {"quantidade": m["quantidade"]}})
            await db.movimentos.delete_one({"id": m["id"]})
        await db.solicitacoes.update_one({"id": sid}, {"$set": {"status": "aprovada"}})
        raise
    await db.solicitacoes.update_one({"id": sid}, {"$set": {"status": "atendida", "atendente_nome": user["nome"]},
                                                   "$push": {"historico": {"status": "atendida", "usuario": user["nome"], "data": now_iso()}}})
    await audit(user, "atender_solicitacao", "solicitacao", sid, f"{s['numero']} - saídas FEFO geradas")
    return await get_sol(sid)


# ---------- Compras ----------
@api.get("/compras/sugestao")
async def sugestao_compra(user=Depends(require("compra_ver"))):
    prods = await produtos_com_saldo({"ativo": True})
    pend = await db.compras.find({"status": {"$in": ["pendente", "aprovado"]}}, {"_id": 0}).to_list(1000)
    pedido = {}
    for c in pend:
        for it in c["itens"]:
            pedido[it["produto_id"]] = pedido.get(it["produto_id"], 0) + it["quantidade"]
    out = []
    for p in prods:
        em_pedido = pedido.get(p["id"], 0)
        if p["saldo_disponivel"] + em_pedido <= p["estoque_minimo"]:
            out.append({"produto_id": p["id"], "codigo": p["codigo"], "descricao": p["descricao"], "unidade": p["unidade"],
                        "saldo_disponivel": p["saldo_disponivel"], "estoque_minimo": p["estoque_minimo"],
                        "estoque_maximo": p["estoque_maximo"], "em_pedido": em_pedido,
                        "quantidade_sugerida": max(p["estoque_maximo"] - p["saldo_disponivel"] - em_pedido, 0),
                        "preco_estimado": p.get("ultimo_custo") or p.get("custo_medio") or 0})
    return out


@api.get("/compras")
async def list_compras(user=Depends(require("compra_ver"))):
    return await db.compras.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)


@api.post("/compras")
async def create_compra(body: CompraIn, user=Depends(require("compra_criar"))):
    if not body.itens:
        raise HTTPException(400, "Adicione ao menos um item")
    itens = []
    for it in body.itens:
        p = await get_produto(it.produto_id)
        itens.append({"produto_id": p["id"], "produto_descricao": p["descricao"], "unidade": p["unidade"],
                      "quantidade": it.quantidade, "preco_estimado": it.preco_estimado, "subtotal": round(it.quantidade * it.preco_estimado, 2)})
    num = await next_seq("compra")
    doc = {"id": new_id(), "numero": f"PC-{num:05d}", "fornecedor": body.fornecedor, "observacao": body.observacao, "itens": itens,
           "valor_total": round(sum(i["subtotal"] for i in itens), 2), "status": "pendente", "criado_por_id": user["id"],
           "criado_por_nome": user["nome"], "aprovador_nome": None, "recebido_por_nome": None, "nota_fiscal": "",
           "motivo_rejeicao": "", "created_at": now_iso()}
    await db.compras.insert_one(dict(doc))
    await audit(user, "criar_pedido_compra", "compra", doc["id"], f"{doc['numero']} {body.fornecedor} R$ {doc['valor_total']:.2f}")
    doc.pop("_id", None)
    return doc


async def get_compra(cid):
    c = await db.compras.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Pedido não encontrado")
    return c


@api.post("/compras/{cid}/aprovar")
async def aprovar_compra(cid: str, user=Depends(require("compra_aprovar"))):
    c = await get_compra(cid)
    if c["status"] != "pendente":
        raise HTTPException(400, "Pedido não está pendente")
    if c["criado_por_id"] == user["id"]:
        raise HTTPException(403, "Segregação de funções: quem criou o pedido não pode aprová-lo")
    await db.compras.update_one({"id": cid}, {"$set": {"status": "aprovado", "aprovador_nome": user["nome"], "aprovado_em": now_iso()}})
    await audit(user, "aprovar_pedido_compra", "compra", cid, f"{c['numero']} R$ {c['valor_total']:.2f}")
    return await get_compra(cid)


@api.post("/compras/{cid}/rejeitar")
async def rejeitar_compra(cid: str, body: MotivoIn, user=Depends(require("compra_aprovar"))):
    c = await get_compra(cid)
    if c["status"] != "pendente":
        raise HTTPException(400, "Pedido não está pendente")
    await db.compras.update_one({"id": cid}, {"$set": {"status": "rejeitado", "motivo_rejeicao": body.motivo, "aprovador_nome": user["nome"]}})
    await audit(user, "rejeitar_pedido_compra", "compra", cid, f"{c['numero']}: {body.motivo}")
    return await get_compra(cid)


@api.post("/compras/{cid}/receber")
async def receber_compra(cid: str, body: RecebimentoIn, user=Depends(require("compra_receber"))):
    c = await get_compra(cid)
    if c["status"] != "aprovado":
        raise HTTPException(400, "Apenas pedidos aprovados podem ser recebidos")
    if not body.nota_fiscal.strip():
        raise HTTPException(400, "Informe a nota fiscal")
    if await db.compras.find_one({"nota_fiscal": body.nota_fiscal.strip(), "fornecedor": c["fornecedor"]}):
        raise HTTPException(400, "Nota fiscal já registrada para este fornecedor")
    if not body.itens:
        raise HTTPException(400, "Informe os itens recebidos")
    pedido_qtd = {}
    for i in c["itens"]:
        pedido_qtd[i["produto_id"]] = pedido_qtd.get(i["produto_id"], 0) + i["quantidade"]
    receb_qtd = {}
    for it in body.itens:
        receb_qtd[it.produto_id] = receb_qtd.get(it.produto_id, 0) + it.quantidade
    for pid, q in receb_qtd.items():
        if q > pedido_qtd.get(pid, 0):
            raise HTTPException(400, "Quantidade recebida maior que a pedida")
    pids = set(pedido_qtd)
    for it in body.itens:
        check_validade(it.validade)
        if it.produto_id not in pids:
            raise HTTPException(400, "Item não pertence ao pedido")
        if it.validade < today_str():
            raise HTTPException(400, "Lote vencido não pode ser recebido")
    r = await db.compras.update_one({"id": cid, "status": "aprovado"}, {"$set": {"status": "recebido", "nota_fiscal": body.nota_fiscal.strip(),
                                                                                "recebido_por_nome": user["nome"], "recebido_em": now_iso()}})
    if r.modified_count == 0:
        raise HTTPException(409, "Pedido já recebido")
    for it in body.itens:
        p = await get_produto(it.produto_id)
        await registrar_entrada(user, p, it.lote_numero.strip(), it.validade, it.quantidade, it.custo_unitario, c["fornecedor"],
                                f"NF {body.nota_fiscal} / {c['numero']}", ref_id=cid)
    await audit(user, "receber_pedido_compra", "compra", cid, f"{c['numero']} NF {body.nota_fiscal} - {len(body.itens)} lote(s)")
    return await get_compra(cid)


# ---------- Dashboard / Auditoria ----------
@api.get("/dashboard")
async def dashboard(user=Depends(require("ver_estoque"))):
    produtos = await produtos_com_saldo({})
    pmap = {p["id"]: p for p in produtos}
    lotes = await db.lotes.find({"quantidade": {"$gt": 0}}, {"_id": 0}).to_list(10000)
    faixas = {k: {"qtd_lotes": 0, "valor": 0.0} for k in ("vencido", "risco_30", "risco_60", "risco_90", "bloqueado")}
    risco_list = []
    for lt in lotes:
        p = pmap.get(lt["produto_id"], {})
        sit = lote_situacao(lt)
        valor = round(lt["quantidade"] * (p.get("custo_medio") or 0), 2)
        if sit in faixas:
            faixas[sit]["qtd_lotes"] += 1
            faixas[sit]["valor"] = round(faixas[sit]["valor"] + valor, 2)
            risco_list.append({"id": lt["id"], "numero": lt["numero"], "validade": lt["validade"], "quantidade": lt["quantidade"],
                               "produto_descricao": p.get("descricao"), "unidade": p.get("unidade"), "situacao": sit,
                               "dias_para_vencer": days_until(lt["validade"]), "valor": valor})
    risco_list.sort(key=lambda x: x["validade"])
    valor_total = round(sum(p["valor_estoque"] for p in produtos), 2)
    por_cat = {}
    for p in produtos:
        por_cat[p["categoria"]] = round(por_cat.get(p["categoria"], 0) + p["valor_estoque"], 2)
    desde = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    consumo = await db.movimentos.aggregate([
        {"$match": {"tipo": "saida", "created_at": {"$gte": desde}}},
        {"$group": {"_id": "$setor_nome", "valor": {"$sum": "$valor"}, "qtd": {"$sum": "$quantidade"}}},
        {"$sort": {"valor": -1}},
    ]).to_list(100)
    valor_risco = round(sum(faixas[k]["valor"] for k in ("vencido", "risco_30", "risco_60", "risco_90")), 2)
    return {
        "valor_total_estoque": valor_total,
        "valor_em_risco": valor_risco,
        "percentual_risco": round(valor_risco / valor_total * 100, 1) if valor_total else 0,
        "lotes_em_risco": sum(faixas[k]["qtd_lotes"] for k in ("vencido", "risco_30", "risco_60", "risco_90")),
        "faixas": faixas,
        "itens_abaixo_minimo": [{"id": p["id"], "codigo": p["codigo"], "descricao": p["descricao"], "saldo_disponivel": p["saldo_disponivel"],
                                 "estoque_minimo": p["estoque_minimo"], "unidade": p["unidade"]} for p in produtos if p["abaixo_minimo"] and p["ativo"]],
        "solicitacoes_pendentes": await db.solicitacoes.count_documents({"status": {"$in": ["pendente", "aprovada"]}}),
        "compras_pendentes": await db.compras.count_documents({"status": {"$in": ["pendente", "aprovado"]}}),
        "total_produtos": len(produtos),
        "valor_por_categoria": [{"categoria": CATEGORIAS.get(k, k), "valor": v} for k, v in por_cat.items()],
        "consumo_por_setor": [{"setor": c["_id"] or "-", "valor": round(c["valor"], 2), "quantidade": c["qtd"]} for c in consumo],
        "lotes_risco": risco_list[:50],
    }


@api.get("/auditoria")
async def list_auditoria(usuario: Optional[str] = None, acao: Optional[str] = None, busca: Optional[str] = None,
                         de: Optional[str] = None, ate: Optional[str] = None, user=Depends(require("auditoria"))):
    q = {}
    if usuario:
        q["usuario_nome"] = {"$regex": usuario, "$options": "i"}
    if acao:
        q["acao"] = acao
    if busca:
        q["detalhes"] = {"$regex": busca, "$options": "i"}
    if de or ate:
        q["created_at"] = {}
        if de:
            q["created_at"]["$gte"] = de
        if ate:
            q["created_at"]["$lte"] = ate + "T23:59:59"
    return await db.auditoria.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)


@api.get("/")
async def root():
    return {"message": "SGEH API"}


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
logging.basicConfig(level=logging.INFO)


@app.on_event("startup")
async def startup():
    await run_seed()


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

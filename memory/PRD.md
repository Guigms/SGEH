# SGEH – Sistema de Gestão de Estoque Hospitalar

## Original problem statement
"desenvolva um sistema de gestao de estoque para um hospital. devera conter niveis de acesso, entrada saida, auditoria, fefo devoluçao de material, compra de material, valor de material em estoque
o material deve ser vinculado ao leito, pois é um hospital publico."
+ documento Mapeamento_Sistema_Estoque_Hospitalar.docx (referência)
Escolhas: login e-mail/senha; vínculo somente leito + setor; custo médio ponderado; compras com aprovação do gestor.
Extra: "devera ter a solicitaçao separado por setor, setor administrativo so pode solicitar material de escritorio, e alguns outros itens, como papel, alcool em gel, e mais, pessoas como por exemplo da CCIH de um hospital nao podem solicitar medicamentos e itens da assitencia." / "faça um sistema simples, mas muito usual, com indicadores, lotes em risco, valor do lote em risco"

## Architecture
FastAPI (core.py: auth/RBAC/FEFO/estoque; seed.py; server.py: rotas /api) + MongoDB + React (pages: Login, Dashboard, Saida, Entrada, Lotes, Devolucao, Solicitacoes, Compras, Produtos, Auditoria, Admin). JWT Bearer.

## Personas
Administrador, Gestor/Aprovador, Farmacêutico, Estoquista, Comprador, Solicitante do setor, Auditor.

## Implemented (2026-10-19)
- RBAC no servidor (7 perfis); bloqueio de login após 5 tentativas
- Entrada com lote/validade/custo → custo médio ponderado
- Saída FEFO automática por setor + leito (leito obrigatório para itens assistenciais em setores assistenciais)
- Lotes: situação vencido/30/60/90, bloqueio/liberação, baixa por perda
- Devolução referenciada à saída original (íntegro volta ao lote; avariado = perda)
- Solicitações por setor restritas por categoria (Administrativo: escritório/higiene; CCIH: EPI/higiene/escritório); aprovar/rejeitar/cancelar/atender (atomic, com rollback)
- Compras: sugestão pelo mínimo, aprovação por pessoa diferente do criador, recebimento com NF + lotes
- Painel: valor total, lotes em risco, valor em risco, abaixo do mínimo, consumo por setor, valor por categoria
- Auditoria: movimentações (rastreio por lote) + log de ações
- Administração: usuários, setores (categorias), leitos

## Backlog
- P1: Inventário com contagem cega e ajuste aprovado; transferência entre setores; recolhimento de lote
- P1: Exportar relatórios (PDF/Excel); curva ABC
- P2: Leitura de código de barras; importação XML NF-e; quarentena

## Next tasks
Validar com usuário; inventário/ajustes.

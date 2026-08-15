# Painel de Projetos KBO

> **Central de portfólio interna da KBO Soluções** — uma plataforma feita pela KBO para KBO, baseada em 20+ anos de experiência em ITSM, integrações e desenvolvimento sob medida.

![Status](https://img.shields.io/badge/status-MVP-yellow)
![Backend](https://img.shields.io/badge/backend-Node.js%20%2B%20TypeScript-blue)
![Frontend](https://img.shields.io/badge/frontend-Vanilla%20JS%20%2B%20Alpine.js-blue)
![Database](https://img.shields.io/badge/database-PostgreSQL-blue)

---

## ✨ O que é

O **Painel de Projetos KBO** é uma ferramenta de gestão de portfólio interna para a KBO Soluções Tecnológicas. Centraliza **todos os projetos, tarefas, releases e notas** em um único lugar — substituindo planilhas soltas, listas em chat e scraps de papel.

Numa única tela você vê:

- 📊 Status agregado de todos os projetos ativos
- 🎯 Tarefas pendentes, em andamento, bloqueadas e concluídas
- 📅 Prazos e alertas visuais
- 👥 Equipe responsável por cada entrega
- 📜 Histórico de versões (releases)
- 💬 Notas e contexto de cada projeto

---

## 🚀 Por que usar

Foi feito **sob medida** porque ferramentas prontas (Trello, Asana, Jira, ClickUp) são genéricas demais para a realidade da KBO:

| Limitação das ferramentas prontas                     | Como o Painel KBO resolve                   |
| ----------------------------------------------------- | ------------------------------------------- |
| Precisam cadastrar empresa inteira pra usar           | **2 perfis**, foco na equipe pequena da KBO |
| Limite de cards, boards, projetos em planos gratuitos | **Ilimitado** (rodando na VPS da KBO)       |
| Não integra com nossa stack (n8n, OpenClaw, Hermes)   | Pensado pra isso desde o dia 1              |
| Custo mensal crescente                                | Custo único de infraestrutura               |
| Dados hospedados em terceiros (LGPD/SOX)              | 100% on-premise KBO                         |

---

## 🏗️ Arquitetura

```
┌──────────────────────────────────────────┐
│ Frontend (Vanilla JS + Alpine.js + Vite) │
│ - Login, Dashboard, Projetos, Tarefas     │
│ - Drag-and-drop estilo Trello             │
└──────────────────────────────────────────┘
            ↓ HTTPS + CSRF
┌──────────────────────────────────────────┐
│ Backend (Node.js + TypeScript + Fastify) │
│ - JWT-less sessão em cookie httpOnly      │
│ - Argon2id para hash de senhas           │
│ - Auditoria transacional                  │
└──────────────────────────────────────────┘
            ↓ SQL
┌──────────────────────────────────────────┐
│ PostgreSQL 16 + Drizzle ORM              │
│ - Lock otimista por versão                │
│ - Migrations versionadas                  │
└──────────────────────────────────────────┘
```

### Stack detalhada

- **Backend**: Node.js 22 + TypeScript + Fastify + Drizzle ORM + Argon2id
- **Frontend**: Vanilla JS + ES Modules + Alpine.js + Vite (build)
- **Banco**: PostgreSQL 16
- **Logs**: Pino (estruturado)
- **Auth**: Sessões em cookie httpOnly + CSRF token
- **Deploy**: Docker + docker-compose + Coolify (VPS própria)
- **Testes**: Vitest + Playwright

---

## 🎨 Design

Identidade visual extraída do site oficial [kbosolucoes.com.br](https://kbosolucoes.com.br):

- **Cor primária**: `#2563eb` (azul corporativo KBO)
- **Cor de destaque**: `#f59e0b` (laranja)
- **Tipografia**: Plus Jakarta Sans (Google Fonts)
- **Estilo**: SaaS moderno, cards coloridos estilo Trello

Ver [docs/branding/BRAND-GUIDELINES.md](docs/branding/BRAND-GUIDELINES.md) para detalhes completos.

---

## 📦 Funcionalidades (MVP)

### ✅ Já entregues

- 🔐 **Login + Logout** com sessões Argon2id
- 📊 **Dashboard** com 4 KPIs (Total, Em Andamento, Atrasado, Concluído)
- 📋 **Lista de Projetos** com filtros (status, cliente, prioridade, saúde, data)
- 🎯 **Detalhe do Projeto** com abas (Visão Geral, Tarefas, Releases, Notas)
- ✅ **CRUD de Tarefas** com status (PENDENTE / EM_ANDAMENTO / BLOQUEADA / CONCLUÍDA / CANCELADA)
- 🎨 **Drag-and-drop** estilo Trello pra mudar status de tarefa
- 🛡️ **Auditoria** de todas as ações críticas
- 📜 **Code automático** (KBO-001, KBO-002...) gerado via Postgres sequence
- 🔄 **Soft archive** + hard delete (2 passos de proteção)

### 🚧 Roadmap

- 📅 **Releases** com versionamento semântico (vX.Y.Z)
- 📊 **Gantt** com Frappe Gantt
- 🔗 **Integrações** com n8n (GitHub, Slack, e-mail)
- 🚀 **Deploy Coolify** com SSL

---

## 🚀 Como rodar localmente

```bash
# Pré-requisitos: Docker, Node.js 22+

# 1. Clonar o repositório
git clone https://github.com/kbokleber/painel-projetos.git
cd painel-projetos

# 2. Subir tudo com Docker
docker compose --env-file .env up -d

# 3. Rodar migrations + seed (cria 2 usuários iniciais)
docker compose exec app npm run db:migrate:prod
docker compose exec app npm run db:seed:prod

# 4. Acessar
open http://localhost:3100

# Credenciais iniciais (vêm no .env.example, altere antes de subir)
# ADMIN:    kbokleber  / senha em SEED_ADMIN_PASSWORD
# OPERATOR: ana        / senha em SEED_OPERATOR_PASSWORD
```

---

## 🔒 Segurança

- Senhas hasheadas com **Argon2id** (memory-hard)
- Sessões em **cookie httpOnly + SameSite=Strict**
- **CSRF token** em todas as mutations
- **Lock otimista** por versão em todas as tabelas (evita lost-update)
- **Auditoria transacional** de login, mutations e deleções
- Soft delete obrigatório antes de hard delete (proteção contra exclusão acidental)

> Antes de ir pra produção, ajuste:
>
> - Rotacione as senhas iniciais usando vault (1Password/Bitwarden)
> - Configure HTTPS com certificado válido
> - Ative rate limiting (planejado pra Fase 6)
> - Configure backup automático do Postgres

---

## 📚 Documentação

- **[`docs/branding/BRAND-GUIDELINES.md`](docs/branding/BRAND-GUIDELINES.md)** — Identidade visual completa
- **[`docs/SOUL.md`](../../profiles/manager/SOUL.md)** — Funcionamento do Gerente de Projetos IA (Ana)
- **API interna** — ver `src/server/` no repositório

---

## 🤝 Sobre a KBO Soluções

A **KBO Soluções Tecnológicas** é uma empresa especializada em ITSM, desenvolvimento de software e integrações, com mais de 20 anos de experiência.

Site oficial: [kbosolucoes.com.br](https://kbosolucoes.com.br)
Fundador: Kleber Bueno

---

## 📄 Licença

Proprietário — uso interno KBO Soluções. Distribuição externa depende de autorização.

# Painel de Projetos KBO

Sistema web interno da KBO Soluções para gestão de projetos, tarefas, releases e visão de portfólio.

> Estado atual: **Fase 1 — Autenticação**. As fases seguintes exigem aprovação separada da Gerência de Projetos e do administrador.

## Escopo entregue na Fase 1

- Login por usuário e senha com hash Argon2id.
- Sessões opacas persistidas no PostgreSQL; somente o hash SHA-256 do token é armazenado.
- Cookies de sessão `HttpOnly`, `SameSite=Strict` e `Secure` em produção.
- Proteção CSRF nas operações de login e logout.
- Perfis `ADMIN` e `OPERATOR`.
- Auditoria em PostgreSQL para login bem-sucedido, falha de login e logout.
- Usuários iniciais `kbokleber` (Administrador) e `ana` (Operador), criados por seed seguro.
- Interface em JavaScript puro com Alpine.js e build Vite.
- API Fastify, migrations Drizzle, testes Vitest, ESLint e Prettier.
- Docker Compose com Node.js 22 e PostgreSQL 16.

Não há cadastro público e não há 2FA no MVP por decisão de governança.

## Stack

- Node.js 22, TypeScript e Fastify
- PostgreSQL 16
- Drizzle ORM e Drizzle Kit
- Argon2id
- Alpine.js e Vite
- Pino (logger nativo do Fastify)
- Vitest, ESLint e Prettier
- Docker e Docker Compose

## Pré-requisitos

Para execução com containers:

- Docker com Docker Compose v2

Para desenvolvimento sem container da aplicação:

- Node.js 22.x
- npm
- PostgreSQL 16 acessível

## Configuração segura

1. Copie `.env.example` para `.env`.
2. Preencha todos os campos vazios.
3. Nunca envie `.env`, senhas, tokens ou hashes ao Git. O `.gitignore` bloqueia arquivos `.env`.

Gere valores aleatórios independentes para cada segredo e senha inicial:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Execute o comando separadamente para:

- `POSTGRES_PASSWORD`
- `COOKIE_SECRET`
- `CSRF_SECRET`
- `SEED_ADMIN_PASSWORD`
- `SEED_OPERATOR_PASSWORD`

As senhas de seed precisam ter pelo menos 12 caracteres. Em produção, utilize o gerenciador de secrets do Coolify em vez de manter um arquivo `.env` no repositório.

Exemplo de ajuste da URL local:

```dotenv
DATABASE_URL=postgresql://painel_app:SENHA_URL_ENCODED@postgres:5432/painel_projetos
```

Se a senha do PostgreSQL contiver caracteres reservados de URL, aplique percent-encoding antes de inseri-la em `DATABASE_URL`.

## Execução com Docker Compose

Após configurar `.env`:

```bash
docker compose up --build
```

O fluxo do container da aplicação:

1. aguarda o health check do PostgreSQL;
2. executa as migrations Drizzle;
3. executa o seed idempotente;
4. inicia a aplicação.

Acesse:

- Login: `http://localhost:3000/login`
- Health check: `http://localhost:3000/health/live`

Para encerrar:

```bash
docker compose down
```

Para remover também o volume local do PostgreSQL (ação destrutiva):

```bash
docker compose down -v
```

## Desenvolvimento local

Instale dependências:

```bash
npm ci
```

Com `DATABASE_URL` apontando para o PostgreSQL:

```bash
npm run db:migrate
npm run db:seed
npm run build
npm start
```

O seed é idempotente: se um username já existir, sua senha é preservada. Para trocar uma senha após a criação inicial, use um fluxo administrativo futuro; não altere o seed para sobrescrever credenciais existentes.

## Comandos de qualidade

```bash
npm test
npm run lint
npm run format:check
npm run build
```

Para gerar uma nova migration após alterar o schema:

```bash
npm run db:generate
```

As migrations versionadas ficam em `drizzle/`.

## Endpoints da Fase 1

### `GET /auth/csrf`

Emite um token CSRF e seu cookie associado. O frontend envia o token no header `x-csrf-token` em requisições de escrita.

### `POST /auth/login`

Payload:

```json
{
  "username": "kbokleber",
  "password": "<senha definida em secret>"
}
```

Em sucesso, retorna o usuário autenticado e define o cookie de sessão. Falhas de credencial sempre retornam a mensagem genérica `Usuário ou senha inválidos.`.

### `GET /auth/me`

Retorna o usuário da sessão atual. Sem sessão válida, retorna HTTP 401.

### `POST /auth/logout`

Exige sessão e token CSRF, remove a sessão no PostgreSQL, limpa o cookie e registra auditoria.

## Banco de dados — Fase 1

- `users`: credenciais, perfil e estado de ativação.
- `sessions`: hash do token opaco, usuário, validade e último acesso.
- `audit_logs`: ação, usuário quando disponível, IP, user-agent, metadados e data.

Índices foram criados para username, expiração de sessões e consultas de auditoria.

## Segurança

- Senhas são processadas com Argon2id.
- Tokens de sessão são aleatórios e nunca são persistidos em texto puro.
- Cookies são `Secure` quando `NODE_ENV=production`.
- CSRF usa token aleatório assinado por HMAC e cookie `SameSite=Strict`.
- Logs Pino removem cookies, `set-cookie`, autorização e senha.
- A mensagem de falha não revela se o usuário existe.
- O seed não imprime senhas nem hashes.
- A aplicação no container roda com usuário sem privilégios de root.

Rate limiting e hardening adicional de produção fazem parte da Fase 6, conforme planejamento aprovado.

## Regra de progresso de projetos

A política aprovada é automática: o percentual será calculado usando somente tarefas não canceladas, considerando como progresso as tarefas concluídas. A constante configurável está em:

`src/server/projects/progress-policy.ts`

Valor atual:

```ts
PROJECT_PROGRESS_CALCULATION = 'COMPLETED_NON_CANCELLED_TASKS';
```

A implementação do cálculo ocorrerá junto ao módulo de projetos/tarefas, sem alterar a política sem autorização.

## Próximas fases

1. Autenticação — fase atual
2. Projetos
3. Tarefas
4. Releases
5. Gantt e dashboard
6. Qualidade, E2E e deploy Coolify

Cada fase exige um GO separado.

## Licença e visibilidade

Este repositório é público por decisão do administrador. Nenhum dado de produção ou segredo deve ser versionado.

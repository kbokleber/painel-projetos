# Painel de Projetos KBO

Sistema web interno da KBO Soluções para gestão de projetos, tarefas, releases e visão de portfólio.

> Estado atual: **Fase 7 — redesign UI/UX**, com autenticação, projetos e tarefas das fases anteriores.

## Escopo entregue na Fase 7

- Design system responsivo KBO, acessível e baseado em Plus Jakarta Sans self-hosted.
- Login profissional, topbar consistente, dashboard com KPIs calculados a partir dos projetos e estados de loading, vazio e erro.
- Projetos em cards ou tabela, filtros completos, modal organizado e preservação das regras de administração.
- Nova página de detalhe em `/projects/:id`, com visão geral, tarefas, releases e notas sem simular backends inexistentes.
- Tarefas em Lista e Kanban, drag and drop otimista com rollback e alternativa acessível por seletor de status.
- Suíte Playwright determinística para desktop, smoke mobile em 360 px e capturas de evolução visual.

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

## Escopo entregue na Fase 2

- CRUD de projetos com código sequencial automático `KBO-001`, `KBO-002` e seguintes.
- Campo único `Cliente/Área`, slug editável, descrição, status, prioridade, datas, equipe, stack, URLs, saúde e notas.
- Filtros por status, cliente/área, período, responsável e prioridade, com paginação e ordenação.
- Concorrência otimista pelo campo `version` em atualizações e mudanças de arquivamento.
- Criação e edição de projetos somente por `ADMIN`; leitura por ambos os perfis.
- Arquivamento por `OPERATOR` e `ADMIN`; restauração e exclusão física somente por `ADMIN`.
- Exclusão física somente após arquivamento e quando não houver tarefas vinculadas.
- Auditoria de criação, atualização, arquivamento, restauração e exclusão.
- Interface Alpine CSP em `/projects`.

## Escopo entregue na Fase 3

- CRUD de tarefas vinculadas a projetos, com status, prioridade `P0` a `P3`, responsável, datas, descrição e posição.
- Filtros, paginação e ordenação por projeto.
- Concorrência otimista pelo campo `version` em atualização e exclusão.
- Projetos arquivados permitem leitura, mas bloqueiam mutações de tarefas.
- Auditoria de criação, atualização e exclusão na mesma transação PostgreSQL da mutação.
- Progresso do projeto recalculado automaticamente por tarefas concluídas entre as não canceladas.
- Interface Alpine CSP em `/projects/:id/tasks`.

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

- Login: `http://localhost:3100/login`
- Projetos: `http://localhost:3100/projects`
- Tarefas: acesse `Tarefas` na linha de um projeto ou `/projects/:id/tasks`
- Health check: `http://localhost:3100/health/live`

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

## Endpoints da Fase 2

Todas as rotas exigem sessão. `POST`, `PATCH` e `DELETE` também exigem o header `x-csrf-token` e o cookie CSRF correspondente.

- `POST /api/projects`: cria projeto, somente para `ADMIN`; o campo `code` é gerado pelo PostgreSQL e não é aceito no payload.
- `GET /api/projects`: lista com paginação, ordenação e filtros `status`, `priority`, `clientArea`, `responsible`, `periodFrom` e `periodTo`.
- `GET /api/projects/:id`: retorna o detalhe de um projeto.
- `PATCH /api/projects/:id`: atualiza parcialmente, somente para `ADMIN`; exige `version` no payload.
- `POST /api/projects/:id/archive`: arquiva por `ADMIN` ou `OPERATOR`; exige `{ "version": n }`.
- `POST /api/projects/:id/restore`: restaura; exige `ADMIN` e `{ "version": n }`.
- `DELETE /api/projects/:id`: exclui projeto arquivado; exige `ADMIN` e `{ "version": n }`.
- `GET /api/projects/stats`: retorna totais simples por status, prioridade e saúde.

Arquivados são ocultos por padrão. Use `archived=include` para incluir todos ou `archived=only` para listar somente arquivados.

## Endpoints da Fase 3

Todas as rotas exigem sessão. `POST`, `PATCH` e `DELETE` também exigem CSRF.

- `POST /api/projects/:projectId/tasks`: cria tarefa vinculada ao projeto.
- `GET /api/projects/:projectId/tasks`: lista tarefas com filtros `search`, `status`, `priority`, `assignee`, `dueFrom` e `dueTo`.
- `GET /api/tasks/:id`: retorna uma tarefa.
- `PATCH /api/tasks/:id`: atualiza parcialmente; exige `version`.
- `PATCH /api/projects/:projectId/tasks/:taskId`: rota preferencial para atualizações; exige `version` e valida o vínculo entre projeto e tarefa.
- `DELETE /api/tasks/:id`: exclui; exige `{ "version": n }`.

Payload mínimo de criação:

```json
{
  "title": "Implementar integração"
}
```

Campos opcionais: `description`, `status`, `priority`, `assignee`, `plannedStartDate`, `dueDate` e `position`. Os defaults são `PENDENTE`, `P2` e posição `0`. Campos desconhecidos, `id`, `projectId`, `completedAt` e `version` são rejeitados na criação.

A rota plana `PATCH /api/tasks/:id` permanece disponível por compatibilidade. A interface da Fase 7 usa a rota aninhada para edições, conclusão e movimentação no Kanban. Em conflito de versão (`409`), recarrega a listagem antes de permitir uma nova alteração.

## Banco de dados — Fase 3

A migration `drizzle/0002_great_omega_flight.sql` cria os enums `task_status` e `task_priority`, a tabela `tasks`, FKs restritivas, constraints de datas/posição/versão, unicidade de título por projeto e índices de consulta. A FK de projeto usa `ON DELETE RESTRICT`.

## Banco de dados — Fase 2

A migration `drizzle/0001_ordinary_invaders.sql` cria:

- sequence `project_code_seq` para códigos automáticos;
- enums de status, prioridade e saúde;
- tabela `projects`, FKs para usuários, checks de progresso/datas e índices de consulta;
- ações adicionais no enum de auditoria.

`client_area` é uma string única por decisão de escopo do MVP. Equipe e stack são armazenadas como arrays PostgreSQL e normalizadas pela API.

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

Na Fase 3, o cálculo é executado na mesma transação de cada criação, atualização ou exclusão de tarefa. Se não houver tarefas não canceladas, o progresso é `0`.

## Próximas fases

1. Autenticação — entregue
2. Projetos — entregue
3. Tarefas — entregue
4. Releases
5. Gantt e dashboard
6. Qualidade, E2E e deploy Coolify

Cada fase exige um GO separado.

## Licença e visibilidade

Este repositório é público por decisão do administrador. Nenhum dado de produção ou segredo deve ser versionado.

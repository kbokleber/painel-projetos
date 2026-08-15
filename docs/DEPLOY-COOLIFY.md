# Guia de Deploy no Coolify

> Passo-a-passo pra subir o **Painel de Projetos KBO** em produção usando Coolify na sua VPS.

**Tempo estimado**: 20-40 minutos (incluindo gerar secrets)

---

## 📋 Pré-requisitos

Antes de começar, garanta:

- [ ] VPS com Coolify já instalado e acessível (pelo painel)
- [ ] Domínio próprio configurado (ex: `painel.kbosolucoes.com.br`) com DNS apontando pra VPS
- [ ] Coolify tem um **projeto** criado (ex: "KBO Soluções")
- [ ] Você tem pelo menos **1 destino** (Destination) configurado — uma VPS ou um servidor vinculado
- [ ] **Acesso ao GitHub** com seu usuário `kbokleber` (já autorizado via token)

---

## 🎲 Estratégia de deploy

**Recomendado** (e o que esse guia assume): **Docker Compose** com build local na VPS.

Alternativas (não cobertas):
- Build e push pra registry privado, depois pull no Coolify
- Deploy via git sem Docker (mais frágil, não recomendo)

---

## 📝 Passo 1 — Gerar secrets seguros

Antes de tudo, **gere secrets fortes** (você nunca deve usar os mesmos que estão no `.env` de dev):

```bash
# Cada um desses gera uma string aleatória de 32+ chars
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Você precisa gerar **pelo menos 4 valores**:

| Variável | Pra quê | Formato |
|---|---|---|
| `POSTGRES_PASSWORD` | Senha do Postgres | string aleatória 32+ |
| `COOKIE_SECRET` | Assinar cookie de sessão | 48+ chars base64url |
| `CSRF_SECRET` | Token CSRF | 48+ chars base64url |
| `SEED_ADMIN_PASSWORD` | Senha inicial do kbokleber | string única forte |
| `SEED_OPERATOR_PASSWORD` | Senha inicial da ana | string única forte |

**Salve num lugar seguro** (1Password/Bitwarden) — você vai precisar delas várias vezes.

---

## 🚀 Passo 2 — Criar o serviço no Coolify

1. No painel do Coolify, vá em **Projects** → escolha seu projeto
2. Clique **+ New Resource** → **Docker Compose**
3. Configure:
   - **Name**: `painel-projetos-kbo`
   - **Source**: Git repository
   - **Git URL**: `https://github.com/kbokleber/painel-projetos.git`
   - **Branch**: `main`
   - **Docker Compose File**: `docker-compose.prod.yml`
   - **Build**: marcado (Coolify executa `docker compose build`)
4. Clique **Deploy** (mas ainda não vai funcionar — falta as env vars)

---

## 🔐 Passo 3 — Configurar variáveis de ambiente

Na seção **Environment Variables** do Coolify, adicione:

```
POSTGRES_DB=painel_projetos
POSTGRES_USER=painel_app
POSTGRES_PASSWORD=<valor gerado no passo 1>
COOKIE_SECRET=<valor gerado no passo 1>
CSRF_SECRET=<valor gerado no passo 1>
SEED_ADMIN_USERNAME=kbokleber
SEED_ADMIN_PASSWORD=<senha forte do admin>
SEED_OPERATOR_USERNAME=ana
SEED_OPERATOR_PASSWORD=<senha forte do operator>
SESSION_TTL_HOURS=8
NODE_ENV=production
APP_PORT=3000
LOG_LEVEL=info
NODE_TLS_REJECT_UNAUTHORIZED=1
```

> 💡 **Dica Coolify**: marque cada variável como **secret** (não aparece em logs).

---

## 🌐 Passo 4 — Configurar domínio e HTTPS

1. No Coolify, depois do primeiro deploy bem-sucedido, vá no serviço → **Domains**
2. Adicione: `painel.kbosolucoes.com.br` (ou seu domínio escolhido)
3. Coolify provisiona automaticamente um certificado **Let's Encrypt** via Traefik
4. HTTPS fica ativo em ~1-2 minutos

**Validação de domínio** (antes de Coolify provisionar o certificado, ele valida que o DNS aponta pra VPS):
```bash
# Do seu computador
dig +short painel.kbosolucoes.com.br
# Deve retornar o IP da sua VPS
```

---

## ✅ Passo 5 — Verificar se tudo subiu

Depois do primeiro deploy, Coolify mostra logs em tempo real. Os pontos de checagem:

1. **Build sucesso**: logs devem mostrar `Successfully built ...`
2. **Migrations aplicadas**: logs do app devem mostrar "Migrations concluídas."
3. **Seed OK**: logs do app devem mostrar "Seed concluído."
4. **Container rodando**: painel Coolify → Containers → status verde

**Verificação manual via navegador**:
- Abra `http://seu-dominio.com` (ou `https`)
- Tela de login deve aparecer
- Faça login com `kbokleber` + a senha que você definiu em `SEED_ADMIN_PASSWORD`
- Dashboard deve carregar

---

## 🔁 Passo 6 — Pós-deploy

### Imediatamente após primeiro deploy

1. **TROQUE as senhas do `kbokleber` e `ana`** (que estão no seed) por senhas fortes únicas:
   - Você pode fazer isso direto no painel web (em "Perfil" se a feature existir)
   - Ou via SQL direto no Postgres (`UPDATE users SET password_hash = ...`)

2. **Verifique os 3 defeitos pendentes** (registrados pela @pedro):
   - DEF-001 logout inconsistente
   - DEF-004 cookie sem flag Secure
   - DEF-006 falta rate limiting

3. **Configure backup automático** (de preferência externo ao Coolify):
   - Job `pg_dump` diário via cron
   - S3 ou similar pra offsite

### Configurações contínuas (recomendadas)

| Item | Quando | Como |
|---|---|---|
| Backup Postgres | Diário | pg_dump + cron |
| Rotação de senhas | Trimestral | UPDATE users SET password_hash |
| Atualizar certificado Let's Encrypt | Automático | Traefik renova sozinho |
| Atualizar dependências | Mensal | Renovar dependabot PRs |

---

## 🛠️ Troubleshooting

### "Build failed"
- Veja os logs do build no Coolify
- Se for erro de TypeScript, rode `npm run build` localmente e veja
- Se for erro de "não encontro arquivo X", confira se commitou tudo

### "App não responde depois do deploy"
- Verifique `docker ps` na VPS ou logs do Coolify
- Healthcheck falhando → serviço não está healthy
- Veja logs: `docker logs painel-app`

### "Login não funciona / 401 sempre"
- Você **esqueceu de rodar o seed** ou **rodou com DB vazio**
- Solução: `docker exec painel-app npm run db:seed:prod`
- Ou crie usuário via SQL no Postgres

### "Cookies / CSRF inválido"
- Provavelmente o `COOKIE_SECRET` ou `CSRF_SECRET` mudou entre deploys
- Sessões antigas viram inválidas → usuário precisa logar de novo
- Persistente? Force logout geral: `UPDATE users SET version = version + 1 WHERE ...` (não testado)

---

## 📊 Métricas pós-deploy

| Item | Valor esperado | Comando pra checar |
|---|---|---|
| Tamanho da imagem | ~150-250 MB | `docker images painel-projetos-kbo-app` |
| Tempo de boot | < 30s | Logs do Coolify |
| Memória em uso | < 200 MB | `docker stats painel-app` |
| Disco (banco) | < 100 MB inicial | `docker exec painel-postgres du -sh /var/lib/postgresql/data` |
| Conexões ativas | < 20 | `docker exec painel-postgres psql -c "SELECT count(*) FROM pg_stat_activity"` |

---

## 📞 Precisa de ajuda?

Se algo der errado:
1. Olhe os **logs do Coolify** primeiro (90% dos casos tá lá)
2. Verifique os **logs dos containers** via `docker logs`
3. Confira se as **variáveis de ambiente** estão corretas
4. Verifique se a **porta 3000** está acessível internamente (e exposta via Traefik)

---

**Última atualização**: agosto/2026
**Mantido por**: Ana (Gerente de Projetos) + @manoel (dev)

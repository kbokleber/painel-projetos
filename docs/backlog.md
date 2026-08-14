# Backlog técnico

Este documento registra itens aprovados para tratamento em fases futuras. Os itens abaixo não fazem parte da correção imediata da Fase 1 e não devem ser implementados antes do GO específico da Fase 6.

## Fase 6 — Segurança, robustez e hardening

### DEF-001 — Logout inconsistente

- **Prioridade:** ALTA
- **Situação:** Pendente
- **Problema:** o cookie de sessão pode não ser removido completamente em todos os cenários de logout.
- **Impacto:** experiência inconsistente e risco de permanência indevida do estado de autenticação no navegador.
- **Critérios mínimos de aceite:**
  - invalidar a sessão no servidor;
  - expirar o cookie usando os mesmos atributos empregados na criação;
  - validar logout normal, sessão expirada e cookie inválido;
  - adicionar testes automatizados de regressão.

### DEF-004 — Cookie sem flag Secure

- **Prioridade:** ALTA
- **Situação:** Pendente
- **Problema:** em ambiente local HTTP o cookie opera sem `Secure`; uma configuração incorreta de produção poderia permitir cookie sem essa flag.
- **Impacto:** crítico em produção HTTPS; sem impacto operacional esperado no desenvolvimento local HTTP.
- **Critérios mínimos de aceite:**
  - tornar `Secure` obrigatório em produção;
  - falhar de forma segura se a configuração de produção estiver incompatível;
  - preservar a execução local HTTP somente no modo de desenvolvimento;
  - cobrir os dois modos com testes automatizados.

### DEF-006 — Ausência de rate limiting

- **Prioridade:** CRÍTICA
- **Situação:** Pendente
- **Problema:** o endpoint de login não possui limitação de tentativas.
- **Impacto:** vulnerabilidade a brute force e abuso automatizado.
- **Critérios mínimos de aceite:**
  - aplicar rate limiting ao login por IP e estratégia complementar definida na Fase 6;
  - responder com HTTP 429 e mensagem genérica;
  - evitar enumeração de usuários;
  - registrar eventos relevantes sem armazenar credenciais;
  - adicionar testes de limite, janela e recuperação.

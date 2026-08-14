import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type AppDependencies } from '../src/server/app.js';
import { hashPassword } from '../src/server/auth/password.js';
import type { AuditEventInput } from '../src/server/audit/audit-repository.js';
import type { SessionStore } from '../src/server/auth/session-store.js';
import type { UserRecord } from '../src/server/users/user-repository.js';

const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];
let passwordHash = '';

beforeAll(async () => {
  passwordHash = await hashPassword('senha-correta-muito-forte');
});

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function createFixture(options: { failAuditAction?: AuditEventInput['action'] } = {}) {
  const audits: AuditEventInput[] = [];
  const sessions = new Map<string, UserRecord>();
  const user: UserRecord = {
    id: randomUUID(),
    username: 'kbokleber',
    passwordHash,
    role: 'ADMIN',
    isActive: true,
  };

  const sessionStore: SessionStore = {
    create: async (authenticatedUser) => {
      const token = 'sessao-opaca-segura';
      sessions.set(token, { ...user, ...authenticatedUser });
      return token;
    },
    findActiveByToken: async (token) => {
      const found = sessions.get(token);
      return found ? { id: found.id, username: found.username, role: found.role } : null;
    },
    deleteByToken: async (token) => {
      sessions.delete(token);
    },
  };

  const dependencies: AppDependencies = {
    users: {
      findByUsername: async (username) => (username === user.username ? user : null),
    },
    sessions: sessionStore,
    audit: {
      record: async (event) => {
        if (event.action === options.failAuditAction) {
          throw new Error('Falha simulada na auditoria.');
        }
        audits.push(event);
      },
    },
    dummyPasswordHash: passwordHash,
  };

  return { dependencies, audits, sessions, user };
}

async function createApp(dependencies: AppDependencies) {
  const app = await buildApp({
    dependencies,
    config: {
      nodeEnv: 'test',
      host: '127.0.0.1',
      port: 3000,
      cookieSecret: 'cookie-secret-com-32-caracteres-minimo',
      csrfSecret: 'csrf-secret-com-32-caracteres-minimo',
      sessionTtlHours: 8,
      serveStatic: false,
    },
  });
  apps.push(app);
  return app;
}

async function getCsrf(app: Awaited<ReturnType<typeof createApp>>) {
  const response = await app.inject({ method: 'GET', url: '/auth/csrf' });
  return {
    token: response.json<{ csrfToken: string }>().csrfToken,
    cookie: response.headers['set-cookie']?.split(';')[0] ?? '',
  };
}

describe('rotas de autenticação', () => {
  it('envia cabeçalhos HTTP de segurança', async () => {
    const { dependencies } = createFixture();
    const app = await createApp(dependencies);

    const response = await app.inject({ method: 'GET', url: '/health/live' });

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['content-security-policy']).toContain("script-src 'self'");
    expect(response.headers['content-security-policy']).not.toContain("'unsafe-eval'");
  });

  it('rejeita login sem um token CSRF válido', async () => {
    const { dependencies } = createFixture();
    const app = await createApp(dependencies);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'kbokleber', password: 'senha-correta-muito-forte' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Requisição inválida.' });
  });

  it('retorna mensagem genérica e audita credenciais inválidas', async () => {
    const { dependencies, audits } = createFixture();
    const app = await createApp(dependencies);
    const csrf = await getCsrf(app);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { cookie: csrf.cookie, 'x-csrf-token': csrf.token },
      payload: { username: 'usuario-inexistente', password: 'senha-qualquer' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Usuário ou senha inválidos.' });
    expect(audits).toEqual([expect.objectContaining({ action: 'LOGIN_FAILURE', userId: null })]);
  });

  it('autentica, cria sessão, define cookie HttpOnly e audita o login', async () => {
    const { dependencies, audits, sessions } = createFixture();
    const app = await createApp(dependencies);
    const csrf = await getCsrf(app);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { cookie: csrf.cookie, 'x-csrf-token': csrf.token },
      payload: { username: 'kbokleber', password: 'senha-correta-muito-forte' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      user: expect.objectContaining({ username: 'kbokleber', role: 'ADMIN' }),
    });
    expect(response.headers['set-cookie']).toContain('kbo_session=sessao-opaca-segura');
    expect(response.headers['set-cookie']).toContain('HttpOnly');
    expect(response.headers['set-cookie']).toContain('SameSite=Strict');
    expect(sessions.has('sessao-opaca-segura')).toBe(true);
    expect(audits).toEqual([
      expect.objectContaining({ action: 'LOGIN_SUCCESS', userId: expect.any(String) }),
    ]);
  });

  it('revoga a sessão e não envia cookie quando a auditoria de login falha', async () => {
    const { dependencies, sessions } = createFixture({ failAuditAction: 'LOGIN_SUCCESS' });
    const app = await createApp(dependencies);
    const csrf = await getCsrf(app);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { cookie: csrf.cookie, 'x-csrf-token': csrf.token },
      payload: { username: 'kbokleber', password: 'senha-correta-muito-forte' },
    });

    expect(response.statusCode).toBe(500);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(sessions.has('sessao-opaca-segura')).toBe(false);
  });

  it('retorna 401 em /auth/me sem cookie', async () => {
    const { dependencies } = createFixture();
    const app = await createApp(dependencies);

    const response = await app.inject({ method: 'GET', url: '/auth/me' });

    expect(response.statusCode).toBe(401);
  });

  it('retorna o usuário autenticado em /auth/me', async () => {
    const { dependencies, sessions, user } = createFixture();
    sessions.set('sessao-existente', user);
    const app = await createApp(dependencies);

    const response = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: 'kbo_session=sessao-existente' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      user: { id: user.id, username: 'kbokleber', role: 'ADMIN' },
    });
  });

  it('encerra a sessão, limpa o cookie e audita o logout', async () => {
    const { dependencies, audits, sessions, user } = createFixture();
    sessions.set('sessao-existente', user);
    const app = await createApp(dependencies);
    const csrf = await getCsrf(app);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: {
        cookie: `${csrf.cookie}; kbo_session=sessao-existente`,
        'x-csrf-token': csrf.token,
      },
    });

    expect(response.statusCode).toBe(204);
    expect(sessions.has('sessao-existente')).toBe(false);
    expect(response.headers['set-cookie']).toContain('kbo_session=');
    expect(audits).toEqual([expect.objectContaining({ action: 'LOGOUT', userId: user.id })]);
  });
});

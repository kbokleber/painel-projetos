import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createSessionGuard,
  type AuthenticatedUser,
  type SessionLookup,
} from '../src/server/auth/session-guard.js';

const user: AuthenticatedUser = {
  id: '8f0c6d98-e0f4-4194-a0d4-13be92556474',
  username: 'kbokleber',
  role: 'ADMIN',
};

const apps: Array<ReturnType<typeof Fastify>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function buildApp(sessionLookup: SessionLookup, mode: 'api' | 'page' = 'api') {
  const app = Fastify();
  apps.push(app);
  void app.register(cookie);
  app.get(
    '/protected',
    { preHandler: createSessionGuard({ sessionLookup, mode }) },
    async (request) => ({ user: request.authUser }),
  );
  return app;
}

describe('session guard', () => {
  it('retorna 401 em rota de API quando o cookie não existe', async () => {
    const app = buildApp({ findActiveByToken: async () => null });

    const response = await app.inject({ method: 'GET', url: '/protected' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Não autenticado.' });
  });

  it('redireciona páginas sem sessão para /login', async () => {
    const app = buildApp({ findActiveByToken: async () => null }, 'page');

    const response = await app.inject({ method: 'GET', url: '/protected' });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/login');
  });

  it('anexa o usuário autenticado quando a sessão é válida', async () => {
    const receivedTokens: string[] = [];
    const app = buildApp({
      findActiveByToken: async (token) => {
        receivedTokens.push(token);
        return user;
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { cookie: 'kbo_session=token-opaco' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ user });
    expect(receivedTokens).toEqual(['token-opaco']);
  });
});

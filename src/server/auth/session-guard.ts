import '@fastify/cookie';
import type { FastifyReply, FastifyRequest } from 'fastify';

export type UserRole = 'ADMIN' | 'OPERATOR';

export interface AuthenticatedUser {
  id: string;
  username: string;
  role: UserRole;
}

export interface SessionLookup {
  findActiveByToken(token: string): Promise<AuthenticatedUser | null>;
}

declare module 'fastify' {
  interface FastifyRequest {
    authUser: AuthenticatedUser | null;
  }
}

interface SessionGuardOptions {
  sessionLookup: SessionLookup;
  mode?: 'api' | 'page';
  cookieName?: string;
}

export function createSessionGuard({
  sessionLookup,
  mode = 'api',
  cookieName = 'kbo_session',
}: SessionGuardOptions) {
  return async function sessionGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const token = request.cookies[cookieName];
    const user = token ? await sessionLookup.findActiveByToken(token) : null;

    request.authUser = user;

    if (user) return;

    if (mode === 'page') {
      await reply.redirect('/login');
      return;
    }

    await reply.code(401).send({ error: 'Não autenticado.' });
  };
}

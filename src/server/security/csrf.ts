import '@fastify/cookie';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

const CSRF_COOKIE = 'kbo_csrf';

interface CsrfOptions {
  secret: string;
  secure: boolean;
}

function signature(token: string, secret: string): string {
  return createHmac('sha256', secret).update(token).digest('base64url');
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function issueCsrfToken(reply: FastifyReply, options: CsrfOptions): string {
  const token = randomBytes(32).toString('base64url');
  const signedToken = `${token}.${signature(token, options.secret)}`;
  reply.setCookie(CSRF_COOKIE, signedToken, {
    path: '/',
    httpOnly: true,
    secure: options.secure,
    sameSite: 'strict',
    maxAge: 60 * 60,
  });
  return token;
}

export function createCsrfGuard(options: CsrfOptions) {
  return async function csrfGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const header = request.headers['x-csrf-token'];
    const cookie = request.cookies[CSRF_COOKIE];
    const headerToken = Array.isArray(header) ? header[0] : header;
    const [cookieToken, cookieSignature] = cookie?.split('.') ?? [];

    const valid =
      typeof headerToken === 'string' &&
      typeof cookieToken === 'string' &&
      typeof cookieSignature === 'string' &&
      safeEqual(headerToken, cookieToken) &&
      safeEqual(cookieSignature, signature(cookieToken, options.secret));

    if (!valid) {
      await reply.code(403).send({ error: 'Requisição inválida.' });
    }
  };
}

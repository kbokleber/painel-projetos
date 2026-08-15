import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { AuditRepository } from './audit/audit-repository.js';
import { verifyPassword } from './auth/password.js';
import { createSessionGuard } from './auth/session-guard.js';
import type { SessionStore } from './auth/session-store.js';
import type { ProjectMutationExecutor, ProjectRepository } from './projects/project-repository.js';
import { registerProjectRoutes } from './projects/project-routes.js';
import { createCsrfGuard, issueCsrfToken } from './security/csrf.js';
import type { TaskMutationExecutor, TaskRepository } from './tasks/task-repository.js';
import { registerTaskRoutes } from './tasks/task-routes.js';
import type { UserRepository } from './users/user-repository.js';

const SESSION_COOKIE = 'kbo_session';
const loginSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(512),
});

export interface AppDependencies {
  users: UserRepository;
  sessions: SessionStore;
  audit: AuditRepository;
  projects?: ProjectRepository;
  projectMutations?: ProjectMutationExecutor;
  tasks?: TaskRepository;
  taskMutations?: TaskMutationExecutor;
  dummyPasswordHash: string;
}

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  cookieSecret: string;
  csrfSecret: string;
  sessionTtlHours: number;
  serveStatic: boolean;
}

interface BuildAppOptions {
  dependencies: AppDependencies;
  config: AppConfig;
}

function requestAuditContext(request: FastifyRequest) {
  const userAgent = request.headers['user-agent'];
  return {
    ipAddress: request.ip,
    userAgent: Array.isArray(userAgent) ? (userAgent[0] ?? null) : (userAgent ?? null),
  };
}

export async function buildApp({
  dependencies,
  config,
}: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      config.nodeEnv === 'test'
        ? false
        : {
            level: config.nodeEnv === 'production' ? 'info' : 'debug',
            redact: [
              'req.headers.authorization',
              'req.headers.cookie',
              'res.headers.set-cookie',
              'body.password',
            ],
          },
  });
  const secureCookies = config.nodeEnv === 'production';
  const csrfGuard = createCsrfGuard({ secret: config.csrfSecret, secure: secureCookies });
  const apiSessionGuard = createSessionGuard({ sessionLookup: dependencies.sessions });
  const pageSessionGuard = createSessionGuard({
    sessionLookup: dependencies.sessions,
    mode: 'page',
  });

  await app.register(cookie, { secret: config.cookieSecret });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'self'"],
      },
    },
    frameguard: { action: 'sameorigin' },
  });
  app.decorateRequest('authUser', null);

  app.get('/health/live', async () => ({ status: 'ok' }));

  app.get('/auth/csrf', async (_request, reply) => {
    const csrfToken = issueCsrfToken(reply, {
      secret: config.csrfSecret,
      secure: secureCookies,
    });
    return { csrfToken };
  });

  app.post('/auth/login', { preHandler: csrfGuard }, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Dados de acesso inválidos.' });
    }

    const user = await dependencies.users.findByUsername(parsed.data.username);
    const passwordMatches = await verifyPassword(
      user?.passwordHash ?? dependencies.dummyPasswordHash,
      parsed.data.password,
    );

    if (!user || !user.isActive || !passwordMatches) {
      await dependencies.audit.record({
        action: 'LOGIN_FAILURE',
        userId: user?.id ?? null,
        ...requestAuditContext(request),
      });
      return reply.code(401).send({ error: 'Usuário ou senha inválidos.' });
    }

    const authenticatedUser = { id: user.id, username: user.username, role: user.role };
    const token = await dependencies.sessions.create(authenticatedUser, config.sessionTtlHours);
    try {
      await dependencies.audit.record({
        action: 'LOGIN_SUCCESS',
        userId: user.id,
        ...requestAuditContext(request),
      });
    } catch (auditError) {
      try {
        await dependencies.sessions.deleteByToken(token);
      } catch (revocationError) {
        request.log.error({ err: revocationError }, 'Falha ao revogar sessão sem auditoria');
      }
      throw auditError;
    }

    reply.setCookie(SESSION_COOKIE, token, {
      path: '/',
      httpOnly: true,
      secure: secureCookies,
      sameSite: 'strict',
      maxAge: config.sessionTtlHours * 60 * 60,
    });
    return reply.send({ user: authenticatedUser });
  });

  app.get('/auth/me', { preHandler: apiSessionGuard }, async (request) => ({
    user: request.authUser,
  }));

  app.post('/auth/logout', { preHandler: [csrfGuard, apiSessionGuard] }, async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) await dependencies.sessions.deleteByToken(token);
    await dependencies.audit.record({
      action: 'LOGOUT',
      userId: request.authUser?.id ?? null,
      ...requestAuditContext(request),
    });
    reply.clearCookie(SESSION_COOKIE, {
      path: '/',
      httpOnly: true,
      secure: secureCookies,
      sameSite: 'strict',
    });
    return reply.code(204).send();
  });

  if (dependencies.projects || dependencies.projectMutations) {
    if (!dependencies.projects || !dependencies.projectMutations) {
      throw new Error(
        'Repositório e executor transacional de projetos devem ser configurados juntos.',
      );
    }
    registerProjectRoutes(app, {
      projects: dependencies.projects,
      mutations: dependencies.projectMutations,
      sessionGuard: apiSessionGuard,
      csrfGuard,
    });
  }

  if (dependencies.tasks || dependencies.taskMutations) {
    if (!dependencies.projects || !dependencies.tasks || !dependencies.taskMutations) {
      throw new Error(
        'Repositórios de projetos/tarefas e executor transacional de tarefas devem ser configurados juntos.',
      );
    }
    registerTaskRoutes(app, {
      projects: dependencies.projects,
      tasks: dependencies.tasks,
      mutations: dependencies.taskMutations,
      sessionGuard: apiSessionGuard,
      csrfGuard,
    });
  }

  if (config.serveStatic) {
    const webRoot = resolve(process.cwd(), 'dist', 'web');
    await app.register(fastifyStatic, {
      root: resolve(webRoot, 'assets'),
      prefix: '/assets/',
    });
    app.get('/', async (_request, reply) => reply.redirect('/dashboard'));
    app.get('/login', async (_request, reply) =>
      reply.type('text/html; charset=utf-8').send(await readFile(resolve(webRoot, 'login.html'))),
    );
    app.get('/dashboard', { preHandler: pageSessionGuard }, async (_request, reply) =>
      reply
        .type('text/html; charset=utf-8')
        .send(await readFile(resolve(webRoot, 'dashboard.html'))),
    );
    app.get('/projects', { preHandler: pageSessionGuard }, async (_request, reply) =>
      reply
        .type('text/html; charset=utf-8')
        .send(await readFile(resolve(webRoot, 'projects.html'))),
    );
    app.get('/projects/:id', { preHandler: pageSessionGuard }, async (_request, reply) =>
      reply
        .type('text/html; charset=utf-8')
        .send(await readFile(resolve(webRoot, 'project-detail.html'))),
    );
    app.get('/projects/:id/tasks', { preHandler: pageSessionGuard }, async (_request, reply) =>
      reply.type('text/html; charset=utf-8').send(await readFile(resolve(webRoot, 'tasks.html'))),
    );
  }

  return app;
}

import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { z } from 'zod';
import type { AuditRepository } from '../audit/audit-repository.js';
import type { ProjectMutationExecutor, ProjectRepository } from './project-repository.js';
import { ProjectService, ProjectServiceError } from './project-service.js';

const idParamsSchema = z.strictObject({ id: z.uuid() });
const versionSchema = z.strictObject({ version: z.number().int().positive() });

function auditContext(request: FastifyRequest) {
  const userAgent = request.headers['user-agent'];
  return {
    ipAddress: request.ip,
    userAgent: Array.isArray(userAgent) ? (userAgent[0] ?? null) : (userAgent ?? null),
  };
}

function requireAdmin(request: FastifyRequest, reply: FastifyReply): boolean {
  if (request.authUser?.role === 'ADMIN') return true;
  void reply.code(403).send({ error: 'Acesso negado.' });
  return false;
}

async function respond<T>(
  reply: FastifyReply,
  action: () => Promise<T>,
): Promise<T | FastifyReply> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof ProjectServiceError) {
      return reply.code(error.statusCode).send({ error: error.message });
    }
    throw error;
  }
}

interface ProjectRouteDependencies {
  projects: ProjectRepository;
  mutations: ProjectMutationExecutor;
  sessionGuard: preHandlerHookHandler;
  csrfGuard: preHandlerHookHandler;
}

function mutate<T>(
  dependencies: ProjectRouteDependencies,
  action: (service: ProjectService, audit: AuditRepository) => Promise<T>,
): Promise<T> {
  return dependencies.mutations.run(({ projects, audit }) =>
    action(new ProjectService(projects), audit),
  );
}

export function registerProjectRoutes(
  app: FastifyInstance,
  dependencies: ProjectRouteDependencies,
): void {
  const readService = new ProjectService(dependencies.projects);
  const readGuard = dependencies.sessionGuard;
  const writeGuards = [dependencies.csrfGuard, dependencies.sessionGuard];

  app.get('/api/projects/stats', { preHandler: readGuard }, async (_request, reply) =>
    respond(reply, () => readService.stats()),
  );

  app.get('/api/projects', { preHandler: readGuard }, async (request, reply) =>
    respond(reply, () => readService.list(request.query)),
  );

  app.get('/api/projects/:id', { preHandler: readGuard }, async (request, reply) =>
    respond(reply, async () => {
      const parsed = idParamsSchema.safeParse(request.params);
      if (!parsed.success) throw new ProjectServiceError(400, 'Identificador de projeto inválido.');
      return readService.get(parsed.data.id);
    }),
  );

  app.post('/api/projects', { preHandler: writeGuards }, async (request, reply) => {
    if (!requireAdmin(request, reply)) return reply;
    return respond(reply, async () => {
      const created = await mutate(dependencies, async (service, audit) => {
        const userId = request.authUser!.id;
        const created = await service.create(request.body, userId);
        await audit.record({
          action: 'PROJECT_CREATED',
          userId,
          metadata: { projectId: created.id, projectCode: created.code },
          ...auditContext(request),
        });
        return created;
      });
      return reply.code(201).send(created);
    });
  });

  app.patch('/api/projects/:id', { preHandler: writeGuards }, async (request, reply) => {
    if (!requireAdmin(request, reply)) return reply;
    return respond(reply, async () => {
      const parsed = idParamsSchema.safeParse(request.params);
      if (!parsed.success) throw new ProjectServiceError(400, 'Identificador de projeto inválido.');
      return mutate(dependencies, async (service, audit) => {
        const userId = request.authUser!.id;
        const updated = await service.update(parsed.data.id, request.body, userId);
        await audit.record({
          action: 'PROJECT_UPDATED',
          userId,
          metadata: { projectId: updated.id, version: updated.version },
          ...auditContext(request),
        });
        return updated;
      });
    });
  });

  app.post('/api/projects/:id/archive', { preHandler: writeGuards }, async (request, reply) =>
    respond(reply, async () => {
      const params = idParamsSchema.safeParse(request.params);
      const body = versionSchema.safeParse(request.body);
      if (!params.success || !body.success)
        throw new ProjectServiceError(400, 'Dados de arquivamento inválidos.');
      return mutate(dependencies, async (service, audit) => {
        const userId = request.authUser!.id;
        const archived = await service.archive(params.data.id, body.data.version, userId);
        await audit.record({
          action: 'PROJECT_ARCHIVED',
          userId,
          metadata: { projectId: archived.id, version: archived.version },
          ...auditContext(request),
        });
        return archived;
      });
    }),
  );

  app.post('/api/projects/:id/restore', { preHandler: writeGuards }, async (request, reply) => {
    if (!requireAdmin(request, reply)) return reply;
    return respond(reply, async () => {
      const params = idParamsSchema.safeParse(request.params);
      const body = versionSchema.safeParse(request.body);
      if (!params.success || !body.success)
        throw new ProjectServiceError(400, 'Dados de restauração inválidos.');
      return mutate(dependencies, async (service, audit) => {
        const userId = request.authUser!.id;
        const restored = await service.restore(params.data.id, body.data.version, userId);
        await audit.record({
          action: 'PROJECT_RESTORED',
          userId,
          metadata: { projectId: restored.id, version: restored.version },
          ...auditContext(request),
        });
        return restored;
      });
    });
  });

  app.delete('/api/projects/:id', { preHandler: writeGuards }, async (request, reply) => {
    if (!requireAdmin(request, reply)) return reply;
    return respond(reply, async () => {
      const params = idParamsSchema.safeParse(request.params);
      const body = versionSchema.safeParse(request.body);
      if (!params.success || !body.success)
        throw new ProjectServiceError(400, 'Dados de exclusão inválidos.');
      await mutate(dependencies, async (service, audit) => {
        const userId = request.authUser!.id;
        await service.delete(params.data.id, body.data.version);
        await audit.record({
          action: 'PROJECT_DELETED',
          userId,
          metadata: { projectId: params.data.id },
          ...auditContext(request),
        });
        return undefined;
      });
      return reply.code(204).send();
    });
  });
}

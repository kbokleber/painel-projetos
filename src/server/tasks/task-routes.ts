import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { z } from 'zod';
import type { AuditRepository } from '../audit/audit-repository.js';
import type { ProjectRepository } from '../projects/project-repository.js';
import type { TaskMutationExecutor, TaskRepository } from './task-repository.js';
import { TaskService, TaskServiceError } from './task-service.js';

const idParamsSchema = z.strictObject({ id: z.uuid() });
const projectParamsSchema = z.strictObject({ projectId: z.uuid() });
const projectTaskParamsSchema = z.strictObject({ projectId: z.uuid(), taskId: z.uuid() });
const versionSchema = z.strictObject({ version: z.number().int().positive() });

function auditContext(request: FastifyRequest) {
  const userAgent = request.headers['user-agent'];
  return {
    ipAddress: request.ip,
    userAgent: Array.isArray(userAgent) ? (userAgent[0] ?? null) : (userAgent ?? null),
  };
}

async function respond<T>(
  reply: FastifyReply,
  action: () => Promise<T>,
): Promise<T | FastifyReply> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof TaskServiceError) {
      return reply.code(error.statusCode).send({ error: error.message });
    }
    throw error;
  }
}

export interface TaskRouteDependencies {
  projects: ProjectRepository;
  tasks: TaskRepository;
  mutations: TaskMutationExecutor;
  sessionGuard: preHandlerHookHandler;
  csrfGuard: preHandlerHookHandler;
}

function mutate<T>(
  dependencies: TaskRouteDependencies,
  action: (service: TaskService, audit: AuditRepository) => Promise<T>,
): Promise<T> {
  return dependencies.mutations.run(({ projects, tasks, audit }) =>
    action(new TaskService(projects, tasks), audit),
  );
}

export function registerTaskRoutes(
  app: FastifyInstance,
  dependencies: TaskRouteDependencies,
): void {
  const readService = new TaskService(dependencies.projects, dependencies.tasks);
  const readGuard = dependencies.sessionGuard;
  const writeGuards = [dependencies.csrfGuard, dependencies.sessionGuard];

  app.get('/api/projects/:projectId/tasks', { preHandler: readGuard }, async (request, reply) =>
    respond(reply, async () => {
      const parsed = projectParamsSchema.safeParse(request.params);
      if (!parsed.success) throw new TaskServiceError(400, 'Identificador de projeto inválido.');
      return readService.list(parsed.data.projectId, request.query);
    }),
  );

  app.get('/api/tasks/:id', { preHandler: readGuard }, async (request, reply) =>
    respond(reply, async () => {
      const parsed = idParamsSchema.safeParse(request.params);
      if (!parsed.success) throw new TaskServiceError(400, 'Identificador de tarefa inválido.');
      return readService.get(parsed.data.id);
    }),
  );

  app.post('/api/projects/:projectId/tasks', { preHandler: writeGuards }, async (request, reply) =>
    respond(reply, async () => {
      const parsed = projectParamsSchema.safeParse(request.params);
      if (!parsed.success) throw new TaskServiceError(400, 'Identificador de projeto inválido.');
      const created = await mutate(dependencies, async (service, audit) => {
        const userId = request.authUser!.id;
        const task = await service.create(parsed.data.projectId, request.body, userId);
        await audit.record({
          action: 'TASK_CREATED',
          userId,
          metadata: { taskId: task.id, projectId: task.projectId },
          ...auditContext(request),
        });
        return task;
      });
      return reply.code(201).send(created);
    }),
  );

  app.patch(
    '/api/projects/:projectId/tasks/:taskId',
    { preHandler: writeGuards },
    async (request, reply) =>
      respond(reply, async () => {
        const parsed = projectTaskParamsSchema.safeParse(request.params);
        if (!parsed.success) throw new TaskServiceError(400, 'Identificadores inválidos.');
        return mutate(dependencies, async (service, audit) => {
          const current = await service.get(parsed.data.taskId);
          if (current.projectId !== parsed.data.projectId) {
            throw new TaskServiceError(404, 'Tarefa não encontrada neste projeto.');
          }
          const userId = request.authUser!.id;
          const task = await service.update(parsed.data.taskId, request.body, userId);
          await audit.record({
            action: 'TASK_UPDATED',
            userId,
            metadata: { taskId: task.id, projectId: task.projectId, version: task.version },
            ...auditContext(request),
          });
          return task;
        });
      }),
  );

  app.patch('/api/tasks/:id', { preHandler: writeGuards }, async (request, reply) =>
    respond(reply, async () => {
      const parsed = idParamsSchema.safeParse(request.params);
      if (!parsed.success) throw new TaskServiceError(400, 'Identificador de tarefa inválido.');
      return mutate(dependencies, async (service, audit) => {
        const userId = request.authUser!.id;
        const task = await service.update(parsed.data.id, request.body, userId);
        await audit.record({
          action: 'TASK_UPDATED',
          userId,
          metadata: { taskId: task.id, projectId: task.projectId, version: task.version },
          ...auditContext(request),
        });
        return task;
      });
    }),
  );

  app.delete('/api/tasks/:id', { preHandler: writeGuards }, async (request, reply) =>
    respond(reply, async () => {
      const params = idParamsSchema.safeParse(request.params);
      const body = versionSchema.safeParse(request.body);
      if (!params.success || !body.success) {
        throw new TaskServiceError(400, 'Dados de exclusão inválidos.');
      }
      await mutate(dependencies, async (service, audit) => {
        const userId = request.authUser!.id;
        const task = await service.get(params.data.id);
        await service.delete(params.data.id, body.data.version);
        await audit.record({
          action: 'TASK_DELETED',
          userId,
          metadata: { taskId: task.id, projectId: task.projectId },
          ...auditContext(request),
        });
      });
      return reply.code(204).send();
    }),
  );
}

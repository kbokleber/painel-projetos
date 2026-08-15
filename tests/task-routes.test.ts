import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, type AppDependencies } from '../src/server/app.js';
import type { AuditEventInput } from '../src/server/audit/audit-repository.js';
import type { AuthenticatedUser } from '../src/server/auth/session-guard.js';
import type {
  Project,
  ProjectRepository,
  ProjectStats,
} from '../src/server/projects/project-repository.js';
import type { Task, TaskRepository } from '../src/server/tasks/task-repository.js';

const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];
const userId = randomUUID();
const projectId = randomUUID();
const taskId = randomUUID();

function project(): Project {
  return {
    id: projectId,
    code: 'KBO-001',
    name: 'Projeto API',
    slug: 'projeto-api',
    description: null,
    clientArea: 'KBO',
    status: 'EM_ANDAMENTO',
    priority: 'ALTA',
    plannedStartDate: null,
    dueDate: null,
    actualEndDate: null,
    responsibleTeam: [],
    technologyStack: [],
    repositoryUrl: null,
    productionUrl: null,
    health: 'VERDE',
    healthReason: null,
    notes: null,
    progressPercent: 0,
    createdByUserId: userId,
    updatedByUserId: userId,
    version: 1,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function projectRepository(): ProjectRepository {
  const value = project();
  return {
    create: async () => value,
    findById: async (id) => (id === projectId ? value : null),
    list: async () => ({ items: [value], total: 1 }),
    update: async () => value,
    setArchived: async () => value,
    delete: async () => false,
    stats: async (): Promise<ProjectStats> => ({
      total: 1,
      active: 1,
      archived: 0,
      byStatus: {},
      byPriority: {},
      byHealth: {},
    }),
  };
}

function taskRepository() {
  let stored: Task | null = null;
  const repository: TaskRepository = {
    lockProject: async () => ({ archivedAt: null }),
    create: async (_projectId, input, actorId) => {
      stored = {
        id: taskId,
        projectId,
        title: input.title,
        description: input.description ?? null,
        status: input.status,
        priority: input.priority,
        assignee: input.assignee ?? null,
        plannedStartDate: input.plannedStartDate ?? null,
        dueDate: input.dueDate ?? null,
        position: input.position,
        completedAt: null,
        version: 1,
        createdByUserId: actorId,
        updatedByUserId: actorId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      return stored;
    },
    findById: async (id) => (stored?.id === id ? stored : null),
    list: async () => ({ items: stored ? [stored] : [], total: stored ? 1 : 0 }),
    update: async (id, input, version, actorId) => {
      if (stored?.id !== id || stored.version !== version) return null;
      stored = { ...stored, ...input, updatedByUserId: actorId, version: version + 1 };
      return stored;
    },
    delete: async (id, version) => {
      if (stored?.id !== id || stored.version !== version) return false;
      stored = null;
      return true;
    },
    recalculateProjectProgress: async () => 0,
  };
  return repository;
}

async function createApp() {
  const audits: AuditEventInput[] = [];
  const user: AuthenticatedUser = { id: userId, username: 'ana', role: 'OPERATOR' };
  const projects = projectRepository();
  const tasks = taskRepository();
  const audit = { record: async (event: AuditEventInput) => void audits.push(event) };
  const dependencies = {
    users: { findByUsername: async () => null },
    sessions: {
      create: async () => 'token',
      findActiveByToken: async (token: string) => (token === 'sessao' ? user : null),
      deleteByToken: async () => undefined,
    },
    audit,
    projects,
    projectMutations: {
      run: async <T>(
        operation: (repositories: {
          projects: ProjectRepository;
          audit: typeof audit;
        }) => Promise<T>,
      ): Promise<T> => operation({ projects, audit }),
    },
    tasks,
    taskMutations: {
      run: async <T>(
        operation: (repositories: {
          projects: ProjectRepository;
          tasks: TaskRepository;
          audit: typeof audit;
        }) => Promise<T>,
      ): Promise<T> => operation({ projects, tasks, audit }),
    },
    dummyPasswordHash: 'hash-nao-utilizado',
  } as unknown as AppDependencies;
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
  const csrfResponse = await app.inject({ method: 'GET', url: '/auth/csrf' });
  const csrf = csrfResponse.json<{ csrfToken: string }>().csrfToken;
  const csrfCookie = csrfResponse.headers['set-cookie']?.split(';')[0] ?? '';
  return {
    app,
    audits,
    readHeaders: { cookie: 'kbo_session=sessao' },
    writeHeaders: {
      cookie: `${csrfCookie}; kbo_session=sessao`,
      'x-csrf-token': csrf,
    },
  };
}

afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

describe('rotas REST de tarefas', () => {
  it('exige sessão nas leituras', async () => {
    const { app } = await createApp();
    expect(
      (await app.inject({ method: 'GET', url: `/api/projects/${projectId}/tasks` })).statusCode,
    ).toBe(401);
    expect((await app.inject({ method: 'GET', url: `/api/tasks/${taskId}` })).statusCode).toBe(401);
  });

  it('exige CSRF nas escritas', async () => {
    const { app, readHeaders } = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/tasks`,
      headers: readHeaders,
      payload: { title: 'Tarefa' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('cria, lista e consulta tarefa com auditoria', async () => {
    const { app, audits, readHeaders, writeHeaders } = await createApp();
    const created = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/tasks`,
      headers: writeHeaders,
      payload: { title: 'Tarefa API' },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      id: taskId,
      projectId,
      status: 'PENDENTE',
      priority: 'P2',
    });
    const listed = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/tasks?status=PENDENTE`,
      headers: readHeaders,
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toMatchObject({ total: 1, page: 1, pageSize: 20 });
    expect(
      (await app.inject({ method: 'GET', url: `/api/tasks/${taskId}`, headers: readHeaders }))
        .statusCode,
    ).toBe(200);
    expect(audits.map((event) => event.action)).toEqual(['TASK_CREATED']);
  });

  it('atualiza com versionamento e auditoria', async () => {
    const { app, audits, writeHeaders } = await createApp();
    await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/tasks`,
      headers: writeHeaders,
      payload: { title: 'Tarefa API' },
    });
    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${taskId}`,
      headers: writeHeaders,
      payload: { version: 1, status: 'CONCLUIDA' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ status: 'CONCLUIDA', version: 2 });
    expect(audits.map((event) => event.action)).toEqual(['TASK_CREATED', 'TASK_UPDATED']);
  });

  it('exclui com versionamento e auditoria', async () => {
    const { app, audits, writeHeaders } = await createApp();
    await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/tasks`,
      headers: writeHeaders,
      payload: { title: 'Tarefa API' },
    });
    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/tasks/${taskId}`,
      headers: writeHeaders,
      payload: { version: 1 },
    });
    expect(removed.statusCode).toBe(204);
    expect(audits.map((event) => event.action)).toEqual(['TASK_CREATED', 'TASK_DELETED']);
  });
});

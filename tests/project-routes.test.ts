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

const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];
const userId = randomUUID();
const projectId = randomUUID();

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: projectId,
    code: 'KBO-001',
    name: 'Projeto API',
    slug: 'projeto-api',
    description: null,
    clientArea: 'Operações',
    status: 'BACKLOG',
    priority: 'MEDIA',
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
    createdAt: new Date('2026-08-14T00:00:00Z'),
    updatedAt: new Date('2026-08-14T00:00:00Z'),
    ...overrides,
  };
}

function projectRepositoryFixture() {
  let stored: Project | null = null;
  const repository: ProjectRepository = {
    create: async (input, actorId) => {
      stored = makeProject({ ...input, createdByUserId: actorId, updatedByUserId: actorId });
      return stored;
    },
    findById: async (id) => (stored?.id === id ? stored : null),
    list: async () => ({ items: stored ? [stored] : [], total: stored ? 1 : 0 }),
    update: async (id, input, expectedVersion, actorId) => {
      if (stored?.id !== id || stored.version !== expectedVersion) return null;
      stored = { ...stored, ...input, updatedByUserId: actorId, version: stored.version + 1 };
      return stored;
    },
    setArchived: async (id, archived, expectedVersion, actorId) => {
      if (stored?.id !== id || stored.version !== expectedVersion) return null;
      stored = {
        ...stored,
        archivedAt: archived ? new Date('2026-08-14T12:00:00Z') : null,
        updatedByUserId: actorId,
        version: stored.version + 1,
      };
      return stored;
    },
    delete: async (id) => {
      if (stored?.id !== id) return false;
      stored = null;
      return true;
    },
    stats: async (): Promise<ProjectStats> => ({
      total: stored ? 1 : 0,
      active: stored && !stored.archivedAt ? 1 : 0,
      archived: stored?.archivedAt ? 1 : 0,
      byStatus: stored ? { [stored.status]: 1 } : {},
      byPriority: stored ? { [stored.priority]: 1 } : {},
      byHealth: stored ? { [stored.health]: 1 } : {},
    }),
  };
  return repository;
}

async function createApp(role: AuthenticatedUser['role'] = 'OPERATOR') {
  const audits: AuditEventInput[] = [];
  const user: AuthenticatedUser = { id: userId, username: 'operador', role };
  const repository = projectRepositoryFixture();
  const audit = { record: async (event: AuditEventInput) => void audits.push(event) };
  const dependencies: AppDependencies = {
    users: { findByUsername: async () => null },
    sessions: {
      create: async () => 'token',
      findActiveByToken: async (token) => (token === 'sessao' ? user : null),
      deleteByToken: async () => undefined,
    },
    audit,
    projects: repository,
    projectMutations: {
      run: async (operation) => operation({ projects: repository, audit }),
    },
    dummyPasswordHash: 'hash-nao-utilizado',
  };
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

const createPayload = {
  name: 'Projeto API',
  slug: 'projeto-api',
  clientArea: 'Operações',
};

describe('rotas REST de projetos', () => {
  it('exige sessão em todas as leituras', async () => {
    const { app } = await createApp();
    for (const url of ['/api/projects', `/api/projects/${projectId}`, '/api/projects/stats']) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode).toBe(401);
    }
  });

  it('exige CSRF nas escritas', async () => {
    const { app, readHeaders } = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: readHeaders,
      payload: createPayload,
    });
    expect(response.statusCode).toBe(403);
  });

  it('permite ao OPERATOR criar, listar, consultar, atualizar e arquivar com auditoria', async () => {
    const { app, audits, readHeaders, writeHeaders } = await createApp();
    const created = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: writeHeaders,
      payload: createPayload,
    });
    expect(created.statusCode).toBe(201);
    expect(created.json<Project>()).toMatchObject({ code: 'KBO-001', progressPercent: 0 });

    const listed = await app.inject({
      method: 'GET',
      url: '/api/projects?status=BACKLOG&clientArea=Opera%C3%A7%C3%B5es',
      headers: readHeaders,
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toMatchObject({ total: 1, page: 1, pageSize: 20 });
    const detail = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}`,
      headers: readHeaders,
    });
    expect(detail.statusCode).toBe(200);

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${projectId}`,
      headers: writeHeaders,
      payload: { version: 1, name: 'Projeto atualizado' },
    });
    expect(updated.statusCode).toBe(200);
    const archived = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/archive`,
      headers: writeHeaders,
      payload: { version: 2 },
    });
    expect(archived.statusCode).toBe(200);
    expect(audits.map((event) => event.action)).toEqual([
      'PROJECT_CREATED',
      'PROJECT_UPDATED',
      'PROJECT_ARCHIVED',
    ]);
  });

  it('bloqueia restauração e exclusão para OPERATOR', async () => {
    const { app, writeHeaders } = await createApp();
    await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: writeHeaders,
      payload: createPayload,
    });
    await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/archive`,
      headers: writeHeaders,
      payload: { version: 1 },
    });
    const restore = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/restore`,
      headers: writeHeaders,
      payload: { version: 2 },
    });
    const remove = await app.inject({
      method: 'DELETE',
      url: `/api/projects/${projectId}`,
      headers: writeHeaders,
      payload: { version: 2 },
    });
    expect(restore.statusCode).toBe(403);
    expect(remove.statusCode).toBe(403);
  });

  it('permite ao ADMIN restaurar e excluir projeto arquivado e consultar estatísticas', async () => {
    const { app, audits, readHeaders, writeHeaders } = await createApp('ADMIN');
    await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: writeHeaders,
      payload: createPayload,
    });
    await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/archive`,
      headers: writeHeaders,
      payload: { version: 1 },
    });
    const restored = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/restore`,
      headers: writeHeaders,
      payload: { version: 2 },
    });
    expect(restored.statusCode).toBe(200);
    await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/archive`,
      headers: writeHeaders,
      payload: { version: 3 },
    });
    const stats = await app.inject({
      method: 'GET',
      url: '/api/projects/stats',
      headers: readHeaders,
    });
    expect(stats.statusCode).toBe(200);
    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/projects/${projectId}`,
      headers: writeHeaders,
      payload: { version: 4 },
    });
    expect(removed.statusCode).toBe(204);
    expect(audits.map((event) => event.action)).toEqual([
      'PROJECT_CREATED',
      'PROJECT_ARCHIVED',
      'PROJECT_RESTORED',
      'PROJECT_ARCHIVED',
      'PROJECT_DELETED',
    ]);
  });
});

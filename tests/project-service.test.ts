import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type {
  Project,
  ProjectRepository,
  ProjectStats,
} from '../src/server/projects/project-repository.js';
import { ProjectHasLinkedTasksError } from '../src/server/projects/project-repository.js';
import { ProjectService } from '../src/server/projects/project-service.js';

function projectFixture(overrides: Partial<Project> = {}): Project {
  return {
    id: randomUUID(),
    code: 'KBO-001',
    name: 'Painel KBO',
    slug: 'painel-kbo',
    description: null,
    clientArea: 'KBO / Operações',
    status: 'EM_ANDAMENTO',
    priority: 'ALTA',
    plannedStartDate: '2026-08-01',
    dueDate: '2026-09-30',
    actualEndDate: null,
    responsibleTeam: ['Ana'],
    technologyStack: ['Node.js'],
    repositoryUrl: null,
    productionUrl: null,
    health: 'VERDE',
    healthReason: null,
    notes: null,
    progressPercent: 0,
    createdByUserId: randomUUID(),
    updatedByUserId: randomUUID(),
    version: 1,
    archivedAt: null,
    createdAt: new Date('2026-08-01T12:00:00Z'),
    updatedAt: new Date('2026-08-01T12:00:00Z'),
    ...overrides,
  };
}

function createFixture(options: { linkedTasks?: boolean } = {}) {
  let project = projectFixture();
  const stats: ProjectStats = {
    total: 1,
    active: 1,
    archived: 0,
    byStatus: { EM_ANDAMENTO: 1 },
    byPriority: { ALTA: 1 },
    byHealth: { VERDE: 1 },
  };
  const repository: ProjectRepository = {
    create: async (_input, userId) => ({
      ...project,
      createdByUserId: userId,
      updatedByUserId: userId,
    }),
    findById: async (id) => (id === project.id ? project : null),
    list: async () => ({ items: [project], total: 1 }),
    update: async (id, input, expectedVersion, userId) => {
      if (id !== project.id || expectedVersion !== project.version) return null;
      project = { ...project, ...input, updatedByUserId: userId, version: project.version + 1 };
      return project;
    },
    setArchived: async (id, archived, expectedVersion, userId) => {
      if (id !== project.id || expectedVersion !== project.version) return null;
      project = {
        ...project,
        archivedAt: archived ? new Date() : null,
        updatedByUserId: userId,
        version: project.version + 1,
      };
      return project;
    },
    delete: async (id) => {
      if (options.linkedTasks) throw new ProjectHasLinkedTasksError();
      return id === project.id;
    },
    stats: async () => stats,
  };
  return { repository, getProject: () => project };
}

describe('ProjectService', () => {
  it('cria sem aceitar código manual', async () => {
    const fixture = createFixture();
    const service = new ProjectService(fixture.repository);

    const created = await service.create(
      {
        name: 'Painel KBO',
        slug: 'painel-kbo',
        clientArea: 'KBO',
        status: 'BACKLOG',
        priority: 'MEDIA',
        responsibleTeam: [],
        technologyStack: [],
        health: 'VERDE',
      },
      randomUUID(),
    );

    expect(created.code).toBe('KBO-001');
  });

  it('detecta conflito de versão no PATCH', async () => {
    const fixture = createFixture();
    const service = new ProjectService(fixture.repository);

    await expect(
      service.update(fixture.getProject().id, { version: 99, name: 'Conflito' }, randomUUID()),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('valida regras usando o estado mesclado no PATCH', async () => {
    const fixture = createFixture();
    const service = new ProjectService(fixture.repository);

    await expect(
      service.update(
        fixture.getProject().id,
        { version: 1, health: 'VERMELHO', healthReason: null },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('arquiva e restaura com concorrência otimista', async () => {
    const fixture = createFixture();
    const service = new ProjectService(fixture.repository);

    const archived = await service.archive(fixture.getProject().id, 1, randomUUID());
    expect(archived.archivedAt).toBeInstanceOf(Date);
    const restored = await service.restore(fixture.getProject().id, 2, randomUUID());
    expect(restored.archivedAt).toBeNull();
  });

  it('bloqueia exclusão física quando houver tarefas', async () => {
    const fixture = createFixture({ linkedTasks: true });
    const service = new ProjectService(fixture.repository);
    await service.archive(fixture.getProject().id, 1, randomUUID());

    await expect(service.delete(fixture.getProject().id, 2)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('exige arquivamento antes da exclusão física', async () => {
    const fixture = createFixture();
    const service = new ProjectService(fixture.repository);

    await expect(service.delete(fixture.getProject().id, 1)).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});

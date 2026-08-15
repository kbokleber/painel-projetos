import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type {
  Project,
  ProjectRepository,
  ProjectStats,
} from '../src/server/projects/project-repository.js';
import type { Task, TaskRepository } from '../src/server/tasks/task-repository.js';
import { DuplicateTaskTitleError } from '../src/server/tasks/task-repository.js';
import { TaskService } from '../src/server/tasks/task-service.js';

const userId = randomUUID();
const projectId = randomUUID();
const taskId = randomUUID();

function projectFixture(overrides: Partial<Project> = {}): Project {
  return {
    id: projectId,
    code: 'KBO-001',
    name: 'Painel KBO',
    slug: 'painel-kbo',
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
    ...overrides,
  };
}

function taskFixture(overrides: Partial<Task> = {}): Task {
  return {
    id: taskId,
    projectId,
    title: 'Implementar tarefas',
    description: null,
    status: 'PENDENTE',
    priority: 'P2',
    assignee: null,
    plannedStartDate: null,
    dueDate: null,
    position: 0,
    completedAt: null,
    createdByUserId: userId,
    updatedByUserId: userId,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function fixture(options: { project?: Project | null; duplicate?: boolean } = {}) {
  const project = options.project === undefined ? projectFixture() : options.project;
  let task: Task | null = null;
  let progressRecalculations = 0;
  const operations: string[] = [];
  const projectStats: ProjectStats = {
    total: 1,
    active: 1,
    archived: 0,
    byStatus: {},
    byPriority: {},
    byHealth: {},
  };
  const projects: ProjectRepository = {
    create: async () => projectFixture(),
    findById: async (id) => (id === projectId ? project : null),
    list: async () => ({ items: project ? [project] : [], total: project ? 1 : 0 }),
    update: async () => project,
    setArchived: async () => project,
    delete: async () => false,
    stats: async () => projectStats,
  };
  const tasks: TaskRepository = {
    lockProject: async () => {
      operations.push('lock');
      return project ? { archivedAt: project.archivedAt } : null;
    },
    create: async (_projectId, input, actorId) => {
      operations.push('create');
      if (options.duplicate) throw new DuplicateTaskTitleError();
      task = taskFixture({ ...input, createdByUserId: actorId, updatedByUserId: actorId });
      return task;
    },
    findById: async (id) => (task?.id === id ? task : null),
    list: async () => ({ items: task ? [task] : [], total: task ? 1 : 0 }),
    update: async (id, input, expectedVersion, actorId) => {
      if (task?.id !== id || task.version !== expectedVersion) return null;
      task = {
        ...task,
        ...input,
        completedAt:
          input.status === 'CONCLUIDA' ? new Date() : input.status ? null : task.completedAt,
        updatedByUserId: actorId,
        version: task.version + 1,
      };
      return task;
    },
    delete: async (id, version) => {
      if (task?.id !== id || task.version !== version) return false;
      task = null;
      return true;
    },
    recalculateProjectProgress: async () => {
      operations.push('progress');
      progressRecalculations += 1;
      return 0;
    },
  };
  return {
    projects,
    tasks,
    setTask: (value: Task) => (task = value),
    getTask: () => task,
    getRecalculations: () => progressRecalculations,
    operations,
  };
}

describe('TaskService', () => {
  it('cria tarefa e recalcula o progresso do projeto', async () => {
    const f = fixture();
    const created = await new TaskService(f.projects, f.tasks).create(
      projectId,
      { title: 'Implementar tarefas', status: 'PENDENTE', priority: 'P2', position: 0 },
      userId,
    );
    expect(created.projectId).toBe(projectId);
    expect(f.getRecalculations()).toBe(1);
    expect(f.operations).toEqual(['lock', 'create', 'progress']);
  });

  it('rejeita projeto inexistente', async () => {
    const f = fixture({ project: null });
    await expect(
      new TaskService(f.projects, f.tasks).create(
        projectId,
        { title: 'Tarefa', status: 'PENDENTE', priority: 'P2', position: 0 },
        userId,
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('bloqueia mutação em projeto arquivado', async () => {
    const f = fixture({ project: projectFixture({ archivedAt: new Date() }) });
    await expect(
      new TaskService(f.projects, f.tasks).create(
        projectId,
        { title: 'Tarefa', status: 'PENDENTE', priority: 'P2', position: 0 },
        userId,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('mapeia título duplicado para conflito', async () => {
    const f = fixture({ duplicate: true });
    await expect(
      new TaskService(f.projects, f.tasks).create(
        projectId,
        { title: 'Tarefa', status: 'PENDENTE', priority: 'P2', position: 0 },
        userId,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('conclui tarefa, mantém completedAt e recalcula progresso', async () => {
    const f = fixture();
    f.setTask(taskFixture());
    const updated = await new TaskService(f.projects, f.tasks).update(
      taskId,
      { version: 1, status: 'CONCLUIDA' },
      userId,
    );
    expect(updated.completedAt).toBeInstanceOf(Date);
    expect(f.getRecalculations()).toBe(1);
  });

  it('detecta conflito de versão no PATCH', async () => {
    const f = fixture();
    f.setTask(taskFixture());
    await expect(
      new TaskService(f.projects, f.tasks).update(
        taskId,
        { version: 99, title: 'Conflito' },
        userId,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('exclui com versionamento e recalcula progresso', async () => {
    const f = fixture();
    f.setTask(taskFixture());
    await new TaskService(f.projects, f.tasks).delete(taskId, 1);
    expect(f.getTask()).toBeNull();
    expect(f.getRecalculations()).toBe(1);
  });
});

import type { Project, ProjectRepository } from '../projects/project-repository.js';
import {
  createTaskSchema,
  listTasksQuerySchema,
  updateTaskSchema,
  type CreateTaskInput,
  type UpdateTaskInput,
} from './task-schemas.js';
import {
  DuplicateTaskTitleError,
  type Task,
  type TaskListResult,
  type TaskRepository,
} from './task-repository.js';

export class TaskServiceError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

function mapDuplicate(error: unknown): never {
  if (error instanceof DuplicateTaskTitleError) {
    throw new TaskServiceError(409, 'Já existe uma tarefa com este título no projeto.');
  }
  throw error;
}

export class TaskService {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly tasks: TaskRepository,
  ) {}

  private async requireProject(projectId: string, mutable = false): Promise<Project> {
    const project = await this.projects.findById(projectId);
    if (!project) throw new TaskServiceError(404, 'Projeto não encontrado.');
    if (mutable && project.archivedAt) {
      throw new TaskServiceError(409, 'Não é possível alterar tarefas de um projeto arquivado.');
    }
    return project;
  }

  private async lockMutableProject(projectId: string): Promise<void> {
    const project = await this.tasks.lockProject(projectId);
    if (!project) throw new TaskServiceError(404, 'Projeto não encontrado.');
    if (project.archivedAt) {
      throw new TaskServiceError(409, 'Não é possível alterar tarefas de um projeto arquivado.');
    }
  }

  async create(projectId: string, rawInput: unknown, userId: string): Promise<Task> {
    await this.lockMutableProject(projectId);
    const parsed = createTaskSchema.safeParse(rawInput);
    if (!parsed.success) throw new TaskServiceError(400, 'Dados da tarefa inválidos.');
    try {
      const task = await this.tasks.create(projectId, parsed.data, userId);
      await this.tasks.recalculateProjectProgress(projectId);
      return task;
    } catch (error) {
      return mapDuplicate(error);
    }
  }

  async get(id: string): Promise<Task> {
    const task = await this.tasks.findById(id);
    if (!task) throw new TaskServiceError(404, 'Tarefa não encontrada.');
    return task;
  }

  async list(
    projectId: string,
    rawQuery: unknown,
  ): Promise<TaskListResult & { page: number; pageSize: number }> {
    await this.requireProject(projectId);
    const parsed = listTasksQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw new TaskServiceError(400, 'Filtros de tarefas inválidos.');
    const result = await this.tasks.list(projectId, parsed.data);
    return { ...result, page: parsed.data.page, pageSize: parsed.data.pageSize };
  }

  async update(id: string, rawInput: unknown, userId: string): Promise<Task> {
    const input = updateTaskSchema.safeParse(rawInput);
    if (!input.success) throw new TaskServiceError(400, 'Dados da tarefa inválidos.');
    const current = await this.get(id);
    await this.lockMutableProject(current.projectId);

    const merged: CreateTaskInput = createTaskSchema.parse({
      title: input.data.title ?? current.title,
      description:
        input.data.description === undefined ? current.description : input.data.description,
      status: input.data.status ?? current.status,
      priority: input.data.priority ?? current.priority,
      assignee: input.data.assignee === undefined ? current.assignee : input.data.assignee,
      plannedStartDate:
        input.data.plannedStartDate === undefined
          ? current.plannedStartDate
          : input.data.plannedStartDate,
      dueDate: input.data.dueDate === undefined ? current.dueDate : input.data.dueDate,
      position: input.data.position ?? current.position,
    });
    const { version, ...changes } = input.data;
    const validatedChanges = Object.fromEntries(
      Object.keys(changes).map((key) => [key, merged[key as keyof CreateTaskInput]]),
    ) as Omit<UpdateTaskInput, 'version'>;

    try {
      const updated = await this.tasks.update(id, validatedChanges, version, userId);
      if (!updated) throw new TaskServiceError(409, 'A tarefa foi alterada por outro usuário.');
      await this.tasks.recalculateProjectProgress(updated.projectId);
      return updated;
    } catch (error) {
      return mapDuplicate(error);
    }
  }

  async delete(id: string, expectedVersion: number): Promise<void> {
    const current = await this.get(id);
    await this.lockMutableProject(current.projectId);
    const deleted = await this.tasks.delete(id, expectedVersion);
    if (!deleted) throw new TaskServiceError(409, 'A tarefa foi alterada por outro usuário.');
    await this.tasks.recalculateProjectProgress(current.projectId);
  }
}

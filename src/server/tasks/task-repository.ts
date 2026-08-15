import type {
  CreateTaskInput,
  ListTasksQuery,
  TASK_PRIORITIES,
  TASK_STATUSES,
  UpdateTaskInput,
} from './task-schemas.js';
import type { AuditRepository } from '../audit/audit-repository.js';
import type { ProjectRepository } from '../projects/project-repository.js';

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: string | null;
  plannedStartDate: string | null;
  dueDate: string | null;
  position: number;
  completedAt: Date | null;
  version: number;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type TaskUpdate = Omit<UpdateTaskInput, 'version'>;

export interface TaskListResult {
  items: Task[];
  total: number;
}

export class DuplicateTaskTitleError extends Error {}

export interface TaskMutationRepositories {
  projects: ProjectRepository;
  tasks: TaskRepository;
  audit: AuditRepository;
}

export interface TaskMutationExecutor {
  run<T>(operation: (repositories: TaskMutationRepositories) => Promise<T>): Promise<T>;
}

export interface TaskRepository {
  lockProject(projectId: string): Promise<{ archivedAt: Date | null } | null>;
  create(projectId: string, input: CreateTaskInput, userId: string): Promise<Task>;
  findById(id: string): Promise<Task | null>;
  list(projectId: string, query: ListTasksQuery): Promise<TaskListResult>;
  update(
    id: string,
    input: TaskUpdate,
    expectedVersion: number,
    userId: string,
  ): Promise<Task | null>;
  delete(id: string, expectedVersion: number): Promise<boolean>;
  recalculateProjectProgress(projectId: string): Promise<number>;
}

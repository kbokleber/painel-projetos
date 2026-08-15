import type {
  CreateProjectInput,
  ListProjectsQuery,
  PROJECT_HEALTH_VALUES,
  PROJECT_PRIORITIES,
  PROJECT_STATUSES,
  UpdateProjectInput,
} from './project-schemas.js';
import type { AuditRepository } from '../audit/audit-repository.js';

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type ProjectPriority = (typeof PROJECT_PRIORITIES)[number];
export type ProjectHealth = (typeof PROJECT_HEALTH_VALUES)[number];

export interface Project {
  id: string;
  code: string;
  name: string;
  slug: string;
  description: string | null;
  clientArea: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  plannedStartDate: string | null;
  dueDate: string | null;
  actualEndDate: string | null;
  responsibleTeam: string[];
  technologyStack: string[];
  repositoryUrl: string | null;
  productionUrl: string | null;
  health: ProjectHealth;
  healthReason: string | null;
  notes: string | null;
  progressPercent: number;
  createdByUserId: string;
  updatedByUserId: string;
  version: number;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ProjectUpdate = Omit<UpdateProjectInput, 'version'>;

export interface ProjectListResult {
  items: Project[];
  total: number;
}

export interface ProjectStats {
  total: number;
  active: number;
  archived: number;
  byStatus: Partial<Record<ProjectStatus, number>>;
  byPriority: Partial<Record<ProjectPriority, number>>;
  byHealth: Partial<Record<ProjectHealth, number>>;
}

export class DuplicateProjectSlugError extends Error {}
export class ProjectHasLinkedTasksError extends Error {}

export interface ProjectMutationRepositories {
  projects: ProjectRepository;
  audit: AuditRepository;
}

export interface ProjectMutationExecutor {
  run<T>(operation: (repositories: ProjectMutationRepositories) => Promise<T>): Promise<T>;
}

export interface ProjectRepository {
  create(input: CreateProjectInput, userId: string): Promise<Project>;
  findById(id: string): Promise<Project | null>;
  list(query: ListProjectsQuery): Promise<ProjectListResult>;
  update(
    id: string,
    input: ProjectUpdate,
    expectedVersion: number,
    userId: string,
  ): Promise<Project | null>;
  setArchived(
    id: string,
    archived: boolean,
    expectedVersion: number,
    userId: string,
  ): Promise<Project | null>;
  delete(id: string, expectedVersion: number): Promise<boolean>;
  stats(): Promise<ProjectStats>;
}

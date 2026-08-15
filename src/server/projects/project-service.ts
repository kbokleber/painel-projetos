import { z } from 'zod';
import {
  DuplicateProjectSlugError,
  ProjectHasLinkedTasksError,
  type Project,
  type ProjectRepository,
  type ProjectStats,
} from './project-repository.js';
import {
  createProjectSchema,
  type CreateProjectInput,
  type ListProjectsQuery,
  listProjectsQuerySchema,
  type UpdateProjectInput,
  updateProjectSchema,
} from './project-schemas.js';

export class ProjectServiceError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

function validationError(error: unknown): never {
  if (error instanceof z.ZodError) {
    throw new ProjectServiceError(400, error.issues[0]?.message ?? 'Dados do projeto inválidos.');
  }
  throw error;
}

function mutableState(project: Project): CreateProjectInput {
  return {
    name: project.name,
    slug: project.slug,
    description: project.description,
    clientArea: project.clientArea,
    status: project.status,
    priority: project.priority,
    plannedStartDate: project.plannedStartDate,
    dueDate: project.dueDate,
    actualEndDate: project.actualEndDate,
    responsibleTeam: project.responsibleTeam,
    technologyStack: project.technologyStack,
    repositoryUrl: project.repositoryUrl,
    productionUrl: project.productionUrl,
    health: project.health,
    healthReason: project.healthReason,
    notes: project.notes,
  };
}

export class ProjectService {
  constructor(private readonly repository: ProjectRepository) {}

  async create(rawInput: unknown, userId: string): Promise<Project> {
    try {
      const input = createProjectSchema.parse(rawInput);
      return await this.repository.create(input, userId);
    } catch (error) {
      if (error instanceof DuplicateProjectSlugError) {
        throw new ProjectServiceError(409, 'Já existe um projeto com este slug.');
      }
      return validationError(error);
    }
  }

  async get(id: string): Promise<Project> {
    const found = await this.repository.findById(id);
    if (!found) throw new ProjectServiceError(404, 'Projeto não encontrado.');
    return found;
  }

  async list(rawQuery: unknown) {
    let query: ListProjectsQuery;
    try {
      query = listProjectsQuerySchema.parse(rawQuery);
    } catch (error) {
      return validationError(error);
    }
    const result = await this.repository.list(query);
    return {
      ...result,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(result.total / query.pageSize),
    };
  }

  async update(id: string, rawInput: unknown, userId: string): Promise<Project> {
    let input: UpdateProjectInput;
    try {
      input = updateProjectSchema.parse(rawInput);
    } catch (error) {
      return validationError(error);
    }
    const current = await this.get(id);
    if (current.archivedAt) {
      throw new ProjectServiceError(409, 'Projeto arquivado não pode ser alterado.');
    }
    if (current.version !== input.version) {
      throw new ProjectServiceError(
        409,
        'O projeto foi alterado por outro usuário. Atualize os dados.',
      );
    }

    const { version, ...changes } = input;
    try {
      createProjectSchema.parse({ ...mutableState(current), ...changes });
      const updated = await this.repository.update(id, changes, version, userId);
      if (!updated) {
        throw new ProjectServiceError(
          409,
          'O projeto foi alterado por outro usuário. Atualize os dados.',
        );
      }
      return updated;
    } catch (error) {
      if (error instanceof DuplicateProjectSlugError) {
        throw new ProjectServiceError(409, 'Já existe um projeto com este slug.');
      }
      if (error instanceof ProjectServiceError) throw error;
      return validationError(error);
    }
  }

  async archive(id: string, version: number, userId: string): Promise<Project> {
    return this.changeArchivedState(id, true, version, userId);
  }

  async restore(id: string, version: number, userId: string): Promise<Project> {
    return this.changeArchivedState(id, false, version, userId);
  }

  private async changeArchivedState(
    id: string,
    archived: boolean,
    version: number,
    userId: string,
  ): Promise<Project> {
    const current = await this.get(id);
    if (current.version !== version) {
      throw new ProjectServiceError(
        409,
        'O projeto foi alterado por outro usuário. Atualize os dados.',
      );
    }
    if (Boolean(current.archivedAt) === archived) {
      throw new ProjectServiceError(
        409,
        archived ? 'Projeto já está arquivado.' : 'Projeto não está arquivado.',
      );
    }
    const changed = await this.repository.setArchived(id, archived, version, userId);
    if (!changed) {
      throw new ProjectServiceError(
        409,
        'O projeto foi alterado por outro usuário. Atualize os dados.',
      );
    }
    return changed;
  }

  async delete(id: string, version: number): Promise<void> {
    const current = await this.get(id);
    if (!current.archivedAt) {
      throw new ProjectServiceError(409, 'Arquive o projeto antes de excluí-lo.');
    }
    if (current.version !== version) {
      throw new ProjectServiceError(
        409,
        'O projeto foi alterado por outro usuário. Atualize os dados.',
      );
    }
    try {
      if (!(await this.repository.delete(id, version))) {
        throw new ProjectServiceError(
          409,
          'O projeto foi alterado por outro usuário. Atualize os dados.',
        );
      }
    } catch (error) {
      if (error instanceof ProjectHasLinkedTasksError) {
        throw new ProjectServiceError(409, 'Projeto com tarefas vinculadas não pode ser excluído.');
      }
      throw error;
    }
  }

  stats(): Promise<ProjectStats> {
    return this.repository.stats();
  }
}

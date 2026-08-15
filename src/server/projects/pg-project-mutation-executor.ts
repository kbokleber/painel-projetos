import type { Database } from '../db/client.js';
import { PgAuditRepository } from '../db/repositories.js';
import type { ProjectMutationExecutor } from './project-repository.js';
import { PgProjectRepository } from './pg-project-repository.js';

export class PgProjectMutationExecutor implements ProjectMutationExecutor {
  constructor(private readonly db: Database) {}

  run<T>(operation: Parameters<ProjectMutationExecutor['run']>[0]): Promise<T> {
    return this.db.transaction(async (transaction) =>
      operation({
        projects: new PgProjectRepository(transaction),
        audit: new PgAuditRepository(transaction),
      }),
    ) as Promise<T>;
  }
}

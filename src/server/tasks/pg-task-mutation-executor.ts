import type { Database } from '../db/client.js';
import { PgAuditRepository } from '../db/repositories.js';
import { PgProjectRepository } from '../projects/pg-project-repository.js';
import type { TaskMutationExecutor } from './task-repository.js';
import { PgTaskRepository } from './pg-task-repository.js';

export class PgTaskMutationExecutor implements TaskMutationExecutor {
  constructor(private readonly db: Database) {}

  run<T>(operation: Parameters<TaskMutationExecutor['run']>[0]): Promise<T> {
    return this.db.transaction(async (transaction) =>
      operation({
        projects: new PgProjectRepository(transaction),
        tasks: new PgTaskRepository(transaction),
        audit: new PgAuditRepository(transaction),
      }),
    ) as Promise<T>;
  }
}

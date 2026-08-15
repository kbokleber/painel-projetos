import { eq } from 'drizzle-orm';
import type { AuditAction } from '../src/server/audit/audit-repository.js';
import { createDatabase } from '../src/server/db/client.js';
import { projects, tasks, users } from '../src/server/db/schema.js';
import { PgTaskMutationExecutor } from '../src/server/tasks/pg-task-mutation-executor.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL não definida.');

const { db, pool } = createDatabase(databaseUrl);
const marker = `f3-transaction-${Date.now()}-${process.pid}`;
let projectId: string | null = null;

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

try {
  const [user] = await db.select({ id: users.id }).from(users).limit(1);
  if (!user) throw new Error('Usuário de teste não encontrado.');

  const [project] = await db
    .insert(projects)
    .values({
      name: marker,
      slug: marker,
      clientArea: 'Integração interna',
      createdByUserId: user.id,
      updatedByUserId: user.id,
    })
    .returning({ id: projects.id });
  if (!project) throw new Error('Projeto sintético não criado.');
  projectId = project.id;

  const executor = new PgTaskMutationExecutor(db);
  let auditFailed = false;
  try {
    await executor.run(async ({ tasks: repository, audit }) => {
      await repository.lockProject(project.id);
      await repository.create(
        project.id,
        { title: `${marker}-rollback`, status: 'CONCLUIDA', priority: 'P2', position: 0 },
        user.id,
      );
      await repository.recalculateProjectProgress(project.id);
      await audit.record({
        action: 'INVALID_TASK_ACTION' as AuditAction,
        userId: user.id,
        ipAddress: '127.0.0.1',
        userAgent: 'transaction-verifier',
      });
    });
  } catch {
    auditFailed = true;
  }
  if (!auditFailed) throw new Error('Falha de auditoria esperada não ocorreu.');

  const rollbackTasks = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.projectId, project.id));
  const [afterRollback] = await db
    .select({ progress: projects.progressPercent })
    .from(projects)
    .where(eq(projects.id, project.id));
  if (rollbackTasks.length !== 0 || afterRollback?.progress !== 0) {
    throw new Error('Rollback não desfez tarefa e progresso atomicamente.');
  }

  let signalFirstLocked!: () => void;
  const firstLocked = new Promise<void>((resolve) => {
    signalFirstLocked = resolve;
  });
  let releaseFirst!: () => void;
  const allowFirstToFinish = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let signalSecondAttempt!: () => void;
  const secondAttemptedLock = new Promise<void>((resolve) => {
    signalSecondAttempt = resolve;
  });
  let secondAcquiredLock = false;

  const first = executor.run(async ({ tasks: repository }) => {
    await repository.lockProject(project.id);
    signalFirstLocked();
    await allowFirstToFinish;
    await repository.create(
      project.id,
      { title: `${marker}-concluida`, status: 'CONCLUIDA', priority: 'P1', position: 1 },
      user.id,
    );
    await repository.recalculateProjectProgress(project.id);
  });
  await firstLocked;

  const second = executor.run(async ({ tasks: repository }) => {
    signalSecondAttempt();
    await repository.lockProject(project.id);
    secondAcquiredLock = true;
    await repository.create(
      project.id,
      { title: `${marker}-pendente`, status: 'PENDENTE', priority: 'P2', position: 2 },
      user.id,
    );
    await repository.recalculateProjectProgress(project.id);
  });
  await secondAttemptedLock;
  await wait(100);
  const secondWasBlocked = !secondAcquiredLock;
  releaseFirst();
  await Promise.all([first, second]);

  if (!secondWasBlocked) {
    throw new Error('A segunda transação adquiriu o lock enquanto a primeira ainda o mantinha.');
  }

  const concurrentTasks = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.projectId, project.id));
  const [afterConcurrency] = await db
    .select({ progress: projects.progressPercent })
    .from(projects)
    .where(eq(projects.id, project.id));
  if (concurrentTasks.length !== 2 || afterConcurrency?.progress !== 50) {
    throw new Error('Serialização concorrente não preservou o progresso esperado de 50%.');
  }

  process.stdout.write('task_transaction_rollback=passed\ntask_concurrency_serialization=passed\n');
} finally {
  if (projectId) {
    await db.delete(tasks).where(eq(tasks.projectId, projectId));
    await db.delete(projects).where(eq(projects.id, projectId));
  }
  await pool.end();
}

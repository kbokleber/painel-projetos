import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { DatabaseExecutor } from '../db/client.js';
import { projects, tasks } from '../db/schema.js';
import {
  DuplicateTaskTitleError,
  type Task,
  type TaskListResult,
  type TaskRepository,
  type TaskUpdate,
} from './task-repository.js';
import type { CreateTaskInput, ListTasksQuery } from './task-schemas.js';

function hasDatabaseErrorCode(error: unknown, expectedCode: string): boolean {
  let current = error;
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth += 1) {
    if ('code' in current && current.code === expectedCode) return true;
    current = 'cause' in current ? current.cause : undefined;
  }
  return false;
}

function mapTask(row: typeof tasks.$inferSelect): Task {
  return row;
}

function conditionsFor(projectId: string, query: ListTasksQuery): SQL[] {
  const conditions: SQL[] = [eq(tasks.projectId, projectId)];
  if (query.search) {
    const value = `%${query.search}%`;
    const search = or(ilike(tasks.title, value), ilike(tasks.description, value));
    if (search) conditions.push(search);
  }
  if (query.status?.length) conditions.push(inArray(tasks.status, query.status));
  if (query.priority?.length) conditions.push(inArray(tasks.priority, query.priority));
  if (query.assignee) conditions.push(ilike(tasks.assignee, `%${query.assignee}%`));
  if (query.dueFrom) conditions.push(gte(tasks.dueDate, query.dueFrom));
  if (query.dueTo) conditions.push(lte(tasks.dueDate, query.dueTo));
  return conditions;
}

const sortColumns = {
  position: tasks.position,
  priority: tasks.priority,
  dueDate: tasks.dueDate,
  createdAt: tasks.createdAt,
  updatedAt: tasks.updatedAt,
} as const;

export class PgTaskRepository implements TaskRepository {
  constructor(private readonly db: DatabaseExecutor) {}

  async lockProject(projectId: string): Promise<{ archivedAt: Date | null } | null> {
    const [project] = await this.db
      .select({ archivedAt: projects.archivedAt })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)
      .for('update');
    return project ?? null;
  }

  async create(projectId: string, input: CreateTaskInput, userId: string): Promise<Task> {
    try {
      const [created] = await this.db
        .insert(tasks)
        .values({
          ...input,
          projectId,
          completedAt: input.status === 'CONCLUIDA' ? new Date() : null,
          createdByUserId: userId,
          updatedByUserId: userId,
        })
        .returning();
      if (!created) throw new Error('Falha ao criar tarefa.');
      return mapTask(created);
    } catch (error) {
      if (hasDatabaseErrorCode(error, '23505')) throw new DuplicateTaskTitleError();
      throw error;
    }
  }

  async findById(id: string): Promise<Task | null> {
    const [found] = await this.db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    return found ? mapTask(found) : null;
  }

  async list(projectId: string, query: ListTasksQuery): Promise<TaskListResult> {
    const where = and(...conditionsFor(projectId, query));
    const column = sortColumns[query.sort];
    const ordering = query.order === 'asc' ? asc(column) : desc(column);
    const offset = (query.page - 1) * query.pageSize;
    const [rows, totals] = await Promise.all([
      this.db
        .select()
        .from(tasks)
        .where(where)
        .orderBy(ordering, asc(tasks.id))
        .limit(query.pageSize)
        .offset(offset),
      this.db.select({ value: count() }).from(tasks).where(where),
    ]);
    return { items: rows.map(mapTask), total: Number(totals[0]?.value ?? 0) };
  }

  async update(
    id: string,
    input: TaskUpdate,
    expectedVersion: number,
    userId: string,
  ): Promise<Task | null> {
    const completedAt =
      input.status === 'CONCLUIDA'
        ? sql<Date>`coalesce(${tasks.completedAt}, now())`
        : input.status
          ? null
          : undefined;
    try {
      const [updated] = await this.db
        .update(tasks)
        .set({
          ...input,
          ...(completedAt === undefined ? {} : { completedAt }),
          updatedByUserId: userId,
          updatedAt: new Date(),
          version: expectedVersion + 1,
        })
        .where(and(eq(tasks.id, id), eq(tasks.version, expectedVersion)))
        .returning();
      return updated ? mapTask(updated) : null;
    } catch (error) {
      if (hasDatabaseErrorCode(error, '23505')) throw new DuplicateTaskTitleError();
      throw error;
    }
  }

  async delete(id: string, expectedVersion: number): Promise<boolean> {
    const deleted = await this.db
      .delete(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.version, expectedVersion)))
      .returning({ id: tasks.id });
    return deleted.length === 1;
  }

  async recalculateProjectProgress(projectId: string): Promise<number> {
    const [updated] = await this.db
      .update(projects)
      .set({
        progressPercent: sql<number>`coalesce((
          select round(
            100.0 * count(*) filter (where ${tasks.status} = 'CONCLUIDA') /
            nullif(count(*) filter (where ${tasks.status} <> 'CANCELADA'), 0)
          )::integer
          from ${tasks}
          where ${tasks.projectId} = ${projectId}
        ), 0)`,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId))
      .returning({ progressPercent: projects.progressPercent });
    return updated?.progressPercent ?? 0;
  }
}

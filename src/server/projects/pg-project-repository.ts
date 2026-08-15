import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { DatabaseExecutor } from '../db/client.js';
import { projects } from '../db/schema.js';
import type {
  Project,
  ProjectListResult,
  ProjectRepository,
  ProjectStats,
  ProjectUpdate,
} from './project-repository.js';
import { DuplicateProjectSlugError } from './project-repository.js';
import { ProjectHasLinkedTasksError } from './project-repository.js';
import type { CreateProjectInput, ListProjectsQuery } from './project-schemas.js';

function hasDatabaseErrorCode(error: unknown, expectedCode: string): boolean {
  let current = error;
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth += 1) {
    if ('code' in current && current.code === expectedCode) return true;
    current = 'cause' in current ? current.cause : undefined;
  }
  return false;
}

function mapProject(row: typeof projects.$inferSelect): Project {
  return row;
}

function conditionsFor(query: ListProjectsQuery): SQL[] {
  const conditions: SQL[] = [];
  if (query.search) {
    const value = `%${query.search}%`;
    const searchCondition = or(
      ilike(projects.name, value),
      ilike(projects.code, value),
      ilike(projects.slug, value),
      ilike(projects.description, value),
    );
    if (searchCondition) conditions.push(searchCondition);
  }
  if (query.status?.length) conditions.push(inArray(projects.status, query.status));
  if (query.priority?.length) conditions.push(inArray(projects.priority, query.priority));
  if (query.health?.length) conditions.push(inArray(projects.health, query.health));

  if (query.clientArea) conditions.push(ilike(projects.clientArea, `%${query.clientArea}%`));
  if (query.responsible) {
    conditions.push(
      sql`exists (select 1 from unnest(${projects.responsibleTeam}) as member where member ilike ${`%${query.responsible}%`})`,
    );
  }
  if (query.periodFrom) conditions.push(gte(projects.dueDate, query.periodFrom));
  if (query.periodTo) conditions.push(lte(projects.plannedStartDate, query.periodTo));

  if (query.archived === 'only') conditions.push(isNotNull(projects.archivedAt));
  else if (query.archived !== 'include') conditions.push(isNull(projects.archivedAt));
  return conditions;
}

const sortColumns = {
  code: projects.code,
  name: projects.name,
  status: projects.status,
  priority: projects.priority,
  health: projects.health,
  plannedStartDate: projects.plannedStartDate,
  dueDate: projects.dueDate,
  updatedAt: projects.updatedAt,
} as const;

export class PgProjectRepository implements ProjectRepository {
  constructor(private readonly db: DatabaseExecutor) {}

  async create(input: CreateProjectInput, userId: string): Promise<Project> {
    try {
      const [created] = await this.db
        .insert(projects)
        .values({ ...input, createdByUserId: userId, updatedByUserId: userId })
        .returning();
      if (!created) throw new Error('Falha ao criar projeto.');
      return mapProject(created);
    } catch (error) {
      if (hasDatabaseErrorCode(error, '23505')) throw new DuplicateProjectSlugError();
      throw error;
    }
  }

  async findById(id: string): Promise<Project | null> {
    const [found] = await this.db.select().from(projects).where(eq(projects.id, id)).limit(1);
    return found ? mapProject(found) : null;
  }

  async list(query: ListProjectsQuery): Promise<ProjectListResult> {
    const conditions = conditionsFor(query);
    const where = conditions.length ? and(...conditions) : undefined;
    const column = sortColumns[query.sort];
    const ordering = query.order === 'asc' ? asc(column) : desc(column);
    const offset = (query.page - 1) * query.pageSize;
    const [rows, totals] = await Promise.all([
      this.db
        .select()
        .from(projects)
        .where(where)
        .orderBy(ordering, asc(projects.id))
        .limit(query.pageSize)
        .offset(offset),
      this.db.select({ value: count() }).from(projects).where(where),
    ]);
    return { items: rows.map(mapProject), total: Number(totals[0]?.value ?? 0) };
  }

  async update(
    id: string,
    input: ProjectUpdate,
    expectedVersion: number,
    userId: string,
  ): Promise<Project | null> {
    try {
      const [updated] = await this.db
        .update(projects)
        .set({
          ...input,
          updatedByUserId: userId,
          updatedAt: new Date(),
          version: expectedVersion + 1,
        })
        .where(
          and(
            eq(projects.id, id),
            eq(projects.version, expectedVersion),
            isNull(projects.archivedAt),
          ),
        )
        .returning();
      return updated ? mapProject(updated) : null;
    } catch (error) {
      if (hasDatabaseErrorCode(error, '23505')) throw new DuplicateProjectSlugError();
      throw error;
    }
  }

  async setArchived(
    id: string,
    archived: boolean,
    expectedVersion: number,
    userId: string,
  ): Promise<Project | null> {
    const [updated] = await this.db
      .update(projects)
      .set({
        archivedAt: archived ? new Date() : null,
        updatedByUserId: userId,
        updatedAt: new Date(),
        version: expectedVersion + 1,
      })
      .where(and(eq(projects.id, id), eq(projects.version, expectedVersion)))
      .returning();
    return updated ? mapProject(updated) : null;
  }

  async delete(id: string, expectedVersion: number): Promise<boolean> {
    try {
      const deleted = await this.db
        .delete(projects)
        .where(
          and(
            eq(projects.id, id),
            eq(projects.version, expectedVersion),
            isNotNull(projects.archivedAt),
          ),
        )
        .returning({ id: projects.id });
      return deleted.length === 1;
    } catch (error) {
      if (hasDatabaseErrorCode(error, '23503')) {
        throw new ProjectHasLinkedTasksError();
      }
      throw error;
    }
  }

  async stats(): Promise<ProjectStats> {
    const rows = await this.db
      .select({
        status: projects.status,
        priority: projects.priority,
        health: projects.health,
        archivedAt: projects.archivedAt,
        total: count(),
      })
      .from(projects)
      .groupBy(projects.status, projects.priority, projects.health, projects.archivedAt);

    const result: ProjectStats = {
      total: 0,
      active: 0,
      archived: 0,
      byStatus: {},
      byPriority: {},
      byHealth: {},
    };
    for (const row of rows) {
      const value = Number(row.total);
      result.total += value;
      if (row.archivedAt) result.archived += value;
      else result.active += value;
      result.byStatus[row.status] = (result.byStatus[row.status] ?? 0) + value;
      result.byPriority[row.priority] = (result.byPriority[row.priority] ?? 0) + value;
      result.byHealth[row.health] = (result.byHealth[row.health] ?? 0) + value;
    }
    return result;
  }
}

import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSequence,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', ['ADMIN', 'OPERATOR']);
export const auditActionEnum = pgEnum('audit_action', [
  'LOGIN_SUCCESS',
  'LOGIN_FAILURE',
  'LOGOUT',
  'PROJECT_CREATED',
  'PROJECT_UPDATED',
  'PROJECT_ARCHIVED',
  'PROJECT_RESTORED',
  'PROJECT_DELETED',
  'TASK_CREATED',
  'TASK_UPDATED',
  'TASK_DELETED',
]);
export const projectStatusEnum = pgEnum('project_status', [
  'BACKLOG',
  'PLANEJADO',
  'EM_ANDAMENTO',
  'PAUSADO',
  'CONCLUIDO',
  'CANCELADO',
]);
export const projectPriorityEnum = pgEnum('project_priority', [
  'BAIXA',
  'MEDIA',
  'ALTA',
  'CRITICA',
]);
export const projectHealthEnum = pgEnum('project_health', ['VERDE', 'AMARELO', 'VERMELHO']);
export const taskStatusEnum = pgEnum('task_status', [
  'PENDENTE',
  'EM_ANDAMENTO',
  'BLOQUEADA',
  'CONCLUIDA',
  'CANCELADA',
]);
export const taskPriorityEnum = pgEnum('task_priority', ['P0', 'P1', 'P2', 'P3']);
export const projectCodeSequence = pgSequence('project_code_seq', {
  startWith: 1,
  increment: 1,
});

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    username: varchar('username', { length: 80 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    role: userRoleEnum('role').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('users_username_unique').on(table.username)],
);

export const sessions = pgTable(
  'sessions',
  {
    tokenHash: varchar('token_hash', { length: 64 }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('sessions_user_id_idx').on(table.userId),
    index('sessions_expires_at_idx').on(table.expiresAt),
  ],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    action: auditActionEnum('action').notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    ipAddress: varchar('ip_address', { length: 64 }).notNull(),
    userAgent: text('user_agent'),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_logs_user_id_idx').on(table.userId),
    index('audit_logs_created_at_idx').on(table.createdAt),
    index('audit_logs_action_idx').on(table.action),
  ],
);

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 32 })
      .notNull()
      .default(sql`'KBO-' || lpad(nextval('project_code_seq')::text, 3, '0')`),
    name: varchar('name', { length: 160 }).notNull(),
    slug: varchar('slug', { length: 180 }).notNull(),
    description: text('description'),
    clientArea: varchar('client_area', { length: 160 }).notNull(),
    status: projectStatusEnum('status').notNull().default('BACKLOG'),
    priority: projectPriorityEnum('priority').notNull().default('MEDIA'),
    plannedStartDate: date('planned_start_date'),
    dueDate: date('due_date'),
    actualEndDate: date('actual_end_date'),
    responsibleTeam: text('responsible_team')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    technologyStack: text('technology_stack')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    repositoryUrl: varchar('repository_url', { length: 2048 }),
    productionUrl: varchar('production_url', { length: 2048 }),
    health: projectHealthEnum('health').notNull().default('VERDE'),
    healthReason: text('health_reason'),
    notes: text('notes'),
    progressPercent: integer('progress_percent').notNull().default(0),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    updatedByUserId: uuid('updated_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    version: integer('version').notNull().default(1),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('projects_code_unique').on(table.code),
    uniqueIndex('projects_slug_unique').on(table.slug),
    index('projects_status_idx').on(table.status),
    index('projects_priority_idx').on(table.priority),
    index('projects_health_idx').on(table.health),
    index('projects_client_area_idx').on(table.clientArea),
    index('projects_due_date_idx').on(table.dueDate),
    index('projects_archived_at_idx').on(table.archivedAt),
    index('projects_updated_at_idx').on(table.updatedAt),
    check('projects_progress_range', sql`${table.progressPercent} between 0 and 100`),
    check(
      'projects_planned_dates_order',
      sql`${table.plannedStartDate} is null or ${table.dueDate} is null or ${table.plannedStartDate} < ${table.dueDate}`,
    ),
  ],
);

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    status: taskStatusEnum('status').notNull().default('PENDENTE'),
    priority: taskPriorityEnum('priority').notNull().default('P2'),
    assignee: varchar('assignee', { length: 80 }),
    plannedStartDate: date('planned_start_date'),
    dueDate: date('due_date'),
    position: integer('position').notNull().default(0),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    updatedByUserId: uuid('updated_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('tasks_project_title_unique').on(table.projectId, sql`lower(${table.title})`),
    index('tasks_project_id_idx').on(table.projectId),
    index('tasks_status_idx').on(table.status),
    index('tasks_priority_idx').on(table.priority),
    index('tasks_assignee_idx').on(table.assignee),
    index('tasks_due_date_idx').on(table.dueDate),
    index('tasks_project_position_idx').on(table.projectId, table.position),
    check('tasks_position_non_negative', sql`${table.position} >= 0`),
    check('tasks_version_positive', sql`${table.version} > 0`),
    check(
      'tasks_planned_dates_order',
      sql`${table.plannedStartDate} is null or ${table.dueDate} is null or ${table.plannedStartDate} <= ${table.dueDate}`,
    ),
  ],
);

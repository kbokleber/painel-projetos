import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  auditActionEnum,
  taskPriorityEnum,
  tasks,
  taskStatusEnum,
} from '../src/server/db/schema.js';

describe('schema Drizzle de tarefas', () => {
  it('define enums canônicos e eventos de auditoria', () => {
    expect(taskStatusEnum.enumValues).toEqual([
      'PENDENTE',
      'EM_ANDAMENTO',
      'BLOQUEADA',
      'CONCLUIDA',
      'CANCELADA',
    ]);
    expect(taskPriorityEnum.enumValues).toEqual(['P0', 'P1', 'P2', 'P3']);
    expect(auditActionEnum.enumValues).toEqual(
      expect.arrayContaining(['TASK_CREATED', 'TASK_UPDATED', 'TASK_DELETED']),
    );
  });

  it('define FK de projeto, versionamento e campos essenciais', () => {
    const config = getTableConfig(tasks);
    expect(config.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        'id',
        'project_id',
        'title',
        'description',
        'status',
        'priority',
        'assignee',
        'planned_start_date',
        'due_date',
        'position',
        'completed_at',
        'version',
        'created_by_user_id',
        'updated_by_user_id',
        'created_at',
        'updated_at',
      ]),
    );
    expect(
      config.foreignKeys.some((foreignKey) => foreignKey.reference().foreignTable === tasks),
    ).toBe(false);
    expect(config.foreignKeys.length).toBeGreaterThanOrEqual(3);
  });

  it('possui índices e constraints de integridade', () => {
    const config = getTableConfig(tasks);
    expect(config.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        'tasks_project_id_idx',
        'tasks_status_idx',
        'tasks_priority_idx',
        'tasks_assignee_idx',
        'tasks_due_date_idx',
        'tasks_project_position_idx',
      ]),
    );
    expect(config.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        'tasks_position_non_negative',
        'tasks_version_positive',
        'tasks_planned_dates_order',
      ]),
    );
  });
});

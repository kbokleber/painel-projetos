import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  projectCodeSequence,
  projectHealthEnum,
  projectPriorityEnum,
  projects,
  projectStatusEnum,
} from '../src/server/db/schema.js';

describe('schema Drizzle de projetos', () => {
  it('define os enums aprovados', () => {
    expect(projectStatusEnum.enumValues).toEqual([
      'BACKLOG',
      'PLANEJADO',
      'EM_ANDAMENTO',
      'PAUSADO',
      'CONCLUIDO',
      'CANCELADO',
    ]);
    expect(projectPriorityEnum.enumValues).toEqual(['BAIXA', 'MEDIA', 'ALTA', 'CRITICA']);
    expect(projectHealthEnum.enumValues).toEqual(['VERDE', 'AMARELO', 'VERMELHO']);
  });

  it('declara sequence automática e todos os campos essenciais', () => {
    expect(projectCodeSequence.seqName).toBe('project_code_seq');
    const config = getTableConfig(projects);
    const names = config.columns.map((column) => column.name);

    expect(names).toEqual(
      expect.arrayContaining([
        'id',
        'code',
        'name',
        'slug',
        'description',
        'client_area',
        'status',
        'priority',
        'planned_start_date',
        'due_date',
        'actual_end_date',
        'responsible_team',
        'technology_stack',
        'repository_url',
        'production_url',
        'health',
        'health_reason',
        'notes',
        'progress_percent',
        'created_by_user_id',
        'updated_by_user_id',
        'created_at',
        'updated_at',
        'archived_at',
        'version',
      ]),
    );
    expect(config.columns.find((column) => column.name === 'code')?.hasDefault).toBe(true);
  });

  it('possui índices de unicidade, filtros e constraints de integridade', () => {
    const config = getTableConfig(projects);
    const indexNames = config.indexes.map((index) => index.config.name);
    const checkNames = config.checks.map((check) => check.name);

    expect(indexNames).toEqual(
      expect.arrayContaining([
        'projects_code_unique',
        'projects_slug_unique',
        'projects_status_idx',
        'projects_client_area_idx',
        'projects_priority_idx',
        'projects_due_date_idx',
        'projects_archived_at_idx',
      ]),
    );
    expect(checkNames).toEqual(
      expect.arrayContaining(['projects_progress_range', 'projects_planned_dates_order']),
    );
  });
});

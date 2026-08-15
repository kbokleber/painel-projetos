import { describe, expect, it } from 'vitest';
import {
  createTaskSchema,
  listTasksQuerySchema,
  updateTaskSchema,
} from '../src/server/tasks/task-schemas.js';

const validTask = {
  title: 'Implementar autenticação',
  description: 'Adicionar fluxo seguro.',
  status: 'EM_ANDAMENTO',
  priority: 'P1',
  assignee: 'kbokleber',
  plannedStartDate: '2026-08-14',
  dueDate: '2026-08-31',
  position: 10,
};

describe('schemas de tarefas', () => {
  it('aceita e normaliza uma tarefa completa', () => {
    expect(createTaskSchema.parse({ ...validTask, title: '  Implementar autenticação  ' })).toEqual(
      validTask,
    );
  });

  it('aplica defaults seguros na criação mínima', () => {
    expect(createTaskSchema.parse({ title: 'Tarefa mínima' })).toEqual({
      title: 'Tarefa mínima',
      status: 'PENDENTE',
      priority: 'P2',
      position: 0,
    });
  });

  it('rejeita campos controlados pelo servidor e campos desconhecidos', () => {
    expect(() =>
      createTaskSchema.parse({ title: 'Inválida', completedAt: '2026-08-14' }),
    ).toThrow();
    expect(() =>
      createTaskSchema.parse({ title: 'Inválida', projectId: crypto.randomUUID() }),
    ).toThrow();
  });

  it('rejeita datas planejadas invertidas', () => {
    expect(() =>
      createTaskSchema.parse({
        title: 'Datas inválidas',
        plannedStartDate: '2026-09-01',
        dueDate: '2026-08-31',
      }),
    ).toThrow();
  });

  it('exige versão e uma alteração no PATCH', () => {
    expect(updateTaskSchema.parse({ version: 2, status: 'CONCLUIDA' })).toEqual({
      version: 2,
      status: 'CONCLUIDA',
    });
    expect(() => updateTaskSchema.parse({ version: 2 })).toThrow();
  });

  it('rejeita enums inválidos', () => {
    expect(() => createTaskSchema.parse({ title: 'Inválida', status: 'ATRASADA' })).toThrow();
    expect(() => createTaskSchema.parse({ title: 'Inválida', priority: 'ALTA' })).toThrow();
  });

  it('normaliza filtros, paginação e ordenação', () => {
    expect(
      listTasksQuerySchema.parse({
        page: '2',
        pageSize: '50',
        status: 'PENDENTE,EM_ANDAMENTO',
        priority: 'P0,P1',
        assignee: 'ana',
        sort: 'dueDate',
        order: 'asc',
      }),
    ).toEqual(
      expect.objectContaining({
        page: 2,
        pageSize: 50,
        status: ['PENDENTE', 'EM_ANDAMENTO'],
        priority: ['P0', 'P1'],
        assignee: 'ana',
        sort: 'dueDate',
        order: 'asc',
      }),
    );
  });

  it('rejeita intervalo de prazo invertido', () => {
    expect(() =>
      listTasksQuerySchema.parse({ dueFrom: '2026-09-01', dueTo: '2026-08-01' }),
    ).toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import {
  createProjectSchema,
  listProjectsQuerySchema,
  updateProjectSchema,
} from '../src/server/projects/project-schemas.js';

const validProject = {
  name: 'Painel de Projetos KBO',
  slug: 'painel-de-projetos-kbo',
  description: 'Central interna de gestão.',
  clientArea: 'KBO / Operações',
  status: 'EM_ANDAMENTO',
  priority: 'ALTA',
  plannedStartDate: '2026-08-01',
  dueDate: '2026-09-30',
  actualEndDate: null,
  responsibleTeam: ['Ana', 'Manoel'],
  technologyStack: ['Node.js', 'PostgreSQL'],
  repositoryUrl: 'https://github.com/kbokleber/painel-projetos',
  productionUrl: null,
  health: 'VERDE',
  healthReason: null,
  notes: 'Entrega por fases.',
};

describe('schemas de projetos', () => {
  it('aceita criação completa e normaliza slug, equipe e stack', () => {
    const result = createProjectSchema.parse({
      ...validProject,
      slug: '  Painel-de-Projetos-KBO  ',
      responsibleTeam: [' Ana ', 'Manoel', 'Ana'],
      technologyStack: [' Node.js ', 'PostgreSQL', 'node.js'],
    });

    expect(result.slug).toBe('painel-de-projetos-kbo');
    expect(result.responsibleTeam).toEqual(['Ana', 'Manoel']);
    expect(result.technologyStack).toEqual(['Node.js', 'PostgreSQL']);
    expect(result).not.toHaveProperty('code');
    expect(result).not.toHaveProperty('progressPercent');
  });

  it('rejeita código informado pelo cliente', () => {
    expect(() => createProjectSchema.parse({ ...validProject, code: 'KBO-999' })).toThrow();
  });

  it('rejeita datas planejadas invertidas ou iguais na criação e atualização', () => {
    expect(() =>
      createProjectSchema.parse({
        ...validProject,
        plannedStartDate: '2026-10-01',
        dueDate: '2026-09-30',
      }),
    ).toThrow();
    expect(() =>
      createProjectSchema.parse({
        ...validProject,
        plannedStartDate: '2026-09-30',
        dueDate: '2026-09-30',
      }),
    ).toThrow();
    expect(() =>
      updateProjectSchema.parse({
        version: 1,
        plannedStartDate: '2026-09-30',
        dueDate: '2026-09-30',
      }),
    ).toThrow();
  });

  it('exige justificativa para saúde amarela ou vermelha', () => {
    expect(() =>
      createProjectSchema.parse({ ...validProject, health: 'VERMELHO', healthReason: null }),
    ).toThrow();
  });

  it('aceita apenas URLs HTTP ou HTTPS', () => {
    expect(() =>
      createProjectSchema.parse({ ...validProject, repositoryUrl: 'javascript:alert(1)' }),
    ).toThrow();
  });

  it('exige version e ao menos uma alteração no PATCH', () => {
    expect(updateProjectSchema.parse({ version: 2, name: 'Novo nome' })).toEqual({
      version: 2,
      name: 'Novo nome',
    });
    expect(() => updateProjectSchema.parse({ version: 2 })).toThrow();
  });

  it('normaliza paginação, filtros múltiplos e arquivamento', () => {
    expect(
      listProjectsQuerySchema.parse({
        page: '2',
        pageSize: '50',
        status: 'BACKLOG,EM_ANDAMENTO',
        priority: 'ALTA,CRITICA',
        health: 'VERDE,AMARELO',
        archived: 'include',
        responsible: 'Ana',
      }),
    ).toEqual(
      expect.objectContaining({
        page: 2,
        pageSize: 50,
        status: ['BACKLOG', 'EM_ANDAMENTO'],
        priority: ['ALTA', 'CRITICA'],
        health: ['VERDE', 'AMARELO'],
        archived: 'include',
        responsible: 'Ana',
      }),
    );
  });

  it('rejeita ranges de período invertidos', () => {
    expect(() =>
      listProjectsQuerySchema.parse({ periodFrom: '2026-12-01', periodTo: '2026-01-01' }),
    ).toThrow();
  });
});

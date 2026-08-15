export const projectId = '11111111-1111-4111-8111-111111111111';
export const project = {
  id: projectId,
  code: 'KBO-018',
  name: 'Portal Nilma',
  slug: 'portal-nilma',
  description: 'Modernização do portal institucional.',
  clientArea: 'Nilma',
  status: 'EM_ANDAMENTO',
  priority: 'ALTA',
  health: 'VERDE',
  healthReason: 'Entrega no ritmo esperado.',
  progressPercent: 60,
  responsibleTeam: ['Ana', 'Manoel'],
  technologyStack: ['Node.js', 'PostgreSQL'],
  plannedStartDate: '2026-08-01',
  dueDate: '2026-09-15',
  actualEndDate: null,
  repositoryUrl: null,
  productionUrl: null,
  notes: 'Kickoff concluído. Escopo validado com o cliente.',
  archivedAt: null,
  version: 1,
  updatedAt: '2026-08-14T12:00:00Z',
};
export const tasks = [
  {
    id: '22222222-2222-4222-8222-222222222222',
    projectId,
    title: 'Revisar conteúdo',
    description: 'Validar páginas principais.',
    status: 'EM_ANDAMENTO',
    priority: 'P1',
    assignee: 'Ana',
    plannedStartDate: '2026-08-10',
    dueDate: '2026-08-20',
    position: 0,
    version: 1,
    updatedAt: '2026-08-14T12:00:00Z',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    projectId,
    title: 'Publicar versão',
    description: null,
    status: 'PENDENTE',
    priority: 'P2',
    assignee: 'Manoel',
    plannedStartDate: null,
    dueDate: '2026-08-25',
    position: 1,
    version: 1,
    updatedAt: '2026-08-13T12:00:00Z',
  },
];
export async function mockApis(page) {
  await page.route('**/auth/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/auth/me')
      return route.fulfill({ json: { user: { id: 'u1', username: 'kbokleber', role: 'ADMIN' } } });
    if (path === '/auth/csrf') return route.fulfill({ json: { csrfToken: 'fixture-csrf' } });
    return route.fulfill({ status: 204 });
  });
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === '/api/projects/stats')
      return route.fulfill({ json: { total: 4, byStatus: { EM_ANDAMENTO: 2, CONCLUIDO: 1 } } });
    if (path === '/api/projects')
      return route.fulfill({
        json: {
          items: [
            project,
            {
              ...project,
              id: '44444444-4444-4444-8444-444444444444',
              code: 'KBO-017',
              name: 'Automação Financeira',
              health: 'AMARELO',
              progressPercent: 35,
              dueDate: '2026-08-01',
            },
          ],
          total: 2,
        },
      });
    if (path === `/api/projects/${projectId}`) return route.fulfill({ json: project });
    if (path === `/api/projects/${projectId}/tasks` && route.request().method() === 'GET')
      return route.fulfill({ json: { items: tasks, total: 2, page: 1, pageSize: 100 } });
    if (path.includes('/tasks/') && route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON();
      const task = tasks.find((t) => path.endsWith(t.id));
      return route.fulfill({ json: { ...task, ...body, version: body.version + 1 } });
    }
    return route.fulfill({ status: 404, json: { error: 'Fixture não encontrada.' } });
  });
}

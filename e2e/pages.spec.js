import { test, expect } from '@playwright/test';
import { mockApis, projectId } from './fixtures.js';

let browserErrors;
let allowedConsoleErrors;
test.beforeEach(async ({ page }) => {
  browserErrors = [];
  allowedConsoleErrors = [];
  page.on('pageerror', (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
  });
  await mockApis(page);
});
test.afterEach(() =>
  expect(
    browserErrors.filter(
      (error) => !allowedConsoleErrors.some((allowed) => error.includes(allowed)),
    ),
  ).toEqual([]),
);
test('login profissional', async ({ page }) => {
  await page.goto('/login.html');
  await expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeDisabled();
});
test('dashboard com KPIs e projetos', async ({ page }) => {
  await page.goto('/dashboard.html');
  await expect(page.getByText('Visão geral')).toBeVisible();
  await expect(page.getByText('Portal Nilma')).toBeVisible();
});
test('projetos em cards e tabela com modal acessível', async ({ page }) => {
  await page.goto('/projects.html');
  await expect(page.getByRole('heading', { name: 'Portal Nilma' })).toBeVisible();
  const filters = page.locator('form.filter-grid');
  await filters.locator('select[x-model="filters.health"]').selectOption('AMARELO');
  await filters.getByRole('button', { name: 'Aplicar filtros' }).click();
  await expect(page).toHaveURL(/health=AMARELO/);
  const openButton = page.getByRole('button', { name: 'Novo projeto' });
  await openButton.click();
  const dialog = page.getByRole('dialog', { name: 'Novo projeto' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Nome *')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(openButton).toBeFocused();
  await page.getByRole('button', { name: 'Visualização em tabela' }).click();
  await expect(page.getByRole('table')).toBeVisible();
});
test('OPERATOR vê leitura e arquivamento, sem criar ou editar projetos', async ({ page }) => {
  await page.route('**/auth/me', async (route) => {
    await route.fulfill({
      json: {
        user: { id: '22222222-2222-4222-8222-222222222222', username: 'ana', role: 'OPERATOR' },
      },
    });
  });
  await page.goto('/projects.html');
  await expect(page.getByRole('button', { name: 'Novo projeto' })).toBeHidden();
  const projectCard = page.getByRole('article').filter({ hasText: 'Portal Nilma' });
  await projectCard.getByRole('button', { name: 'Ações do projeto' }).click();
  await expect(projectCard.getByRole('button', { name: 'Editar' })).toBeHidden();
  await expect(projectCard.getByRole('button', { name: 'Arquivar' })).toBeVisible();

  await page.goto(`/project-detail.html?id=${projectId}`);
  await expect(page.getByRole('button', { name: 'Editar projeto' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Arquivar projeto' })).toBeVisible();
});

test('parâmetro edit abre projeto preenchido', async ({ page }) => {
  await page.goto(`/projects.html?edit=${projectId}`);
  const dialog = page.getByRole('dialog', { name: 'Editar projeto' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Nome *')).toHaveValue('Portal Nilma');
});

test('detalhe com abas e ações governadas', async ({ page }) => {
  await page.goto(`/project-detail.html?id=${projectId}`);
  await expect(page.getByRole('heading', { name: 'Portal Nilma' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar projeto' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Arquivar projeto' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Excluir projeto' })).toBeHidden();
  await page.getByRole('button', { name: 'Releases' }).click();
  await expect(page.getByText('Nenhuma release cadastrada')).toBeVisible();
});
test('modal de tarefa preserva planejamento e gerencia foco', async ({ page }) => {
  await page.goto(`/tasks.html?id=${projectId}`);
  const openButton = page.getByRole('button', { name: 'Nova tarefa' });
  await openButton.click();
  const dialog = page.getByRole('dialog', { name: 'Nova tarefa' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Início planejado')).toBeVisible();
  await expect(dialog.getByLabel('Posição')).toBeVisible();
  await expect(dialog.getByLabel('Título *')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(openButton).toBeFocused();
});

test('kanban recarrega o card e avisa no conflito 409', async ({ page }) => {
  allowedConsoleErrors = ['409 (Conflict)'];
  await page.route(
    `**/api/projects/${projectId}/tasks/33333333-3333-4333-8333-333333333333`,
    async (route) => {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Conflito.' }),
      });
    },
  );
  await page.goto(`/tasks.html?id=${projectId}`);
  const card = page.getByTestId('task-card-33333333-3333-4333-8333-333333333333');
  await card.dragTo(page.getByTestId('column-CONCLUIDA'));
  await expect(page.getByTestId('column-PENDENTE').getByText('Publicar versão')).toBeVisible();
  await expect(page.getByRole('status')).toContainText('alterada por outra pessoa');
});

test('kanban faz PATCH aninhado com versão', async ({ page }) => {
  let sent;
  await page.route(`**/api/projects/${projectId}/tasks/*`, async (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({
      json: {
        ...sent,
        id: route.request().url().split('/').pop(),
        projectId,
        title: 'Publicar versão',
        priority: 'P2',
        version: sent.version + 1,
      },
    });
  });
  await page.goto(`/tasks.html?id=${projectId}`);
  const card = page.getByTestId('task-card-33333333-3333-4333-8333-333333333333');
  await expect(
    card.getByRole('checkbox', { name: 'Marcar Publicar versão como concluída' }),
  ).toBeVisible();
  await card.dragTo(page.getByTestId('column-CONCLUIDA'));
  await expect.poll(() => sent).toEqual({ status: 'CONCLUIDA', version: 1 });
});

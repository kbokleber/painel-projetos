import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('frontend de tarefas', () => {
  it('consulta o endpoint canônico do usuário autenticado', async () => {
    const source = await readFile('web/src/tasks.js', 'utf8');
    expect(source).toContain("fetch('/auth/me'");
    expect(source).not.toContain("fetch('/api/me'");
  });
});

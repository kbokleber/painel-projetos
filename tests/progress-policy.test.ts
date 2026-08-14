import { describe, expect, it } from 'vitest';
import { PROJECT_PROGRESS_CALCULATION } from '../src/server/projects/progress-policy.js';

describe('política de progresso de projeto', () => {
  it('mantém o cálculo automático baseado em tarefas concluídas e não canceladas', () => {
    expect(PROJECT_PROGRESS_CALCULATION).toBe('COMPLETED_NON_CANCELLED_TASKS');
  });
});

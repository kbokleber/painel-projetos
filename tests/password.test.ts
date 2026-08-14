import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/server/auth/password.js';

describe('password', () => {
  it('gera um hash Argon2id e valida a senha correta', async () => {
    const hash = await hashPassword('uma-senha-forte');

    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(verifyPassword(hash, 'uma-senha-forte')).resolves.toBe(true);
  });

  it('rejeita uma senha incorreta sem lançar erro', async () => {
    const hash = await hashPassword('senha-correta');

    await expect(verifyPassword(hash, 'senha-incorreta')).resolves.toBe(false);
  });
});

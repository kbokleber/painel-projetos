import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { hashPassword } from '../src/server/auth/password.js';
import { createDatabase } from '../src/server/db/client.js';
import { users } from '../src/server/db/schema.js';
import type { UserRole } from '../src/server/auth/session-guard.js';

const databaseUrl = process.env.DATABASE_URL;
const adminPassword = process.env.SEED_ADMIN_PASSWORD;
const operatorPassword = process.env.SEED_OPERATOR_PASSWORD;
const adminUsername = (process.env.SEED_ADMIN_USERNAME || 'kbokleber').trim().toLowerCase();
const operatorUsername = (process.env.SEED_OPERATOR_USERNAME || 'ana').trim().toLowerCase();

if (!databaseUrl) throw new Error('DATABASE_URL é obrigatória para o seed.');
if (!adminPassword || adminPassword.length < 12) {
  throw new Error('SEED_ADMIN_PASSWORD deve ter pelo menos 12 caracteres.');
}
if (!operatorPassword || operatorPassword.length < 12) {
  throw new Error('SEED_OPERATOR_PASSWORD deve ter pelo menos 12 caracteres.');
}
if (adminUsername === operatorUsername)
  throw new Error('Os usernames iniciais devem ser distintos.');

const { db, pool } = createDatabase(databaseUrl);

async function createUserIfMissing(username: string, password: string, role: UserRole) {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username));
  if (existing) {
    console.log(`Usuário ${username} já existe; senha preservada.`);
    return;
  }
  const passwordHash = await hashPassword(password);
  await db.insert(users).values({ username, passwordHash, role });
  console.log(`Usuário ${username} criado com perfil ${role}.`);
}

try {
  await createUserIfMissing(adminUsername, adminPassword, 'ADMIN');
  await createUserIfMissing(operatorUsername, operatorPassword, 'OPERATOR');
} finally {
  await pool.end();
}

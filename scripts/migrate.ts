import 'dotenv/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from '../src/server/db/client.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL é obrigatória para executar migrations.');

const { db, pool } = createDatabase(databaseUrl);
try {
  await migrate(db, { migrationsFolder: 'drizzle' });
  console.log('Migrations concluídas.');
} finally {
  await pool.end();
}

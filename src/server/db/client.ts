import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

export function createDatabase(databaseUrl: string) {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export type Database = ReturnType<typeof createDatabase>['db'];
export type DatabaseTransaction = Parameters<Database['transaction']>[0] extends (
  transaction: infer T,
) => unknown
  ? T
  : never;
export type DatabaseExecutor = Database | DatabaseTransaction;

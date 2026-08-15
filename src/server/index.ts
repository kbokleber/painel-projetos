import { randomBytes } from 'node:crypto';
import { buildApp } from './app.js';
import { hashPassword } from './auth/password.js';
import { loadConfig } from './config.js';
import { createDatabase } from './db/client.js';
import { PgAuditRepository, PgSessionStore, PgUserRepository } from './db/repositories.js';
import { PgProjectRepository } from './projects/pg-project-repository.js';
import { PgProjectMutationExecutor } from './projects/pg-project-mutation-executor.js';

const config = loadConfig();
const { db, pool } = createDatabase(config.databaseUrl);
const dummyPasswordHash = await hashPassword(randomBytes(32).toString('base64url'));
const app = await buildApp({
  config: { ...config, serveStatic: true },
  dependencies: {
    users: new PgUserRepository(db),
    sessions: new PgSessionStore(db),
    audit: new PgAuditRepository(db),
    projects: new PgProjectRepository(db),
    projectMutations: new PgProjectMutationExecutor(db),
    dummyPasswordHash,
  },
});

async function shutdown(signal: string) {
  app.log.info({ signal }, 'Encerrando aplicação');
  await app.close();
  await pool.end();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error, 'Falha ao iniciar aplicação');
  await pool.end();
  process.exit(1);
}

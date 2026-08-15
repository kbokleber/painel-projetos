import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import type { AuditEventInput, AuditRepository } from '../audit/audit-repository.js';
import type { AuthenticatedUser } from '../auth/session-guard.js';
import type { SessionStore } from '../auth/session-store.js';
import type { UserRecord, UserRepository } from '../users/user-repository.js';
import type { Database, DatabaseExecutor } from './client.js';
import { auditLogs, sessions, users } from './schema.js';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class PgUserRepository implements UserRepository {
  constructor(private readonly db: Database) {}

  async findByUsername(username: string): Promise<UserRecord | null> {
    const [row] = await this.db
      .select({
        id: users.id,
        username: users.username,
        passwordHash: users.passwordHash,
        role: users.role,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);
    return row ?? null;
  }
}

export class PgSessionStore implements SessionStore {
  constructor(private readonly db: Database) {}

  async create(user: AuthenticatedUser, ttlHours: number): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
    await this.db.insert(sessions).values({
      tokenHash: hashToken(token),
      userId: user.id,
      expiresAt,
    });
    return token;
  }

  async findActiveByToken(token: string): Promise<AuthenticatedUser | null> {
    const tokenHash = hashToken(token);
    const [row] = await this.db
      .select({ id: users.id, username: users.username, role: users.role })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(
        and(
          eq(sessions.tokenHash, tokenHash),
          gt(sessions.expiresAt, new Date()),
          eq(users.isActive, true),
        ),
      )
      .limit(1);

    if (!row) return null;
    await this.db
      .update(sessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(sessions.tokenHash, tokenHash));
    return row;
  }

  async deleteByToken(token: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
}

export class PgAuditRepository implements AuditRepository {
  constructor(private readonly db: DatabaseExecutor) {}

  async record(event: AuditEventInput): Promise<void> {
    await this.db.insert(auditLogs).values({
      action: event.action,
      userId: event.userId,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      metadata: event.metadata ?? {},
    });
  }
}

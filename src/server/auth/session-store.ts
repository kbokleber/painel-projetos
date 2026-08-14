import type { AuthenticatedUser, SessionLookup } from './session-guard.js';

export interface SessionStore extends SessionLookup {
  create(user: AuthenticatedUser, ttlHours: number): Promise<string>;
  deleteByToken(token: string): Promise<void>;
}

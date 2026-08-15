import type { UserRole } from '../auth/session-guard.js';

export interface UserRecord {
  id: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
}

export interface UserRepository {
  findByUsername(username: string): Promise<UserRecord | null>;
}

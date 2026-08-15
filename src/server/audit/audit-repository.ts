export type AuditAction = 'LOGIN_SUCCESS' | 'LOGIN_FAILURE' | 'LOGOUT';

export interface AuditEventInput {
  action: AuditAction;
  userId: string | null;
  ipAddress: string;
  userAgent: string | null;
  metadata?: Record<string, unknown>;
}

export interface AuditRepository {
  record(event: AuditEventInput): Promise<void>;
}

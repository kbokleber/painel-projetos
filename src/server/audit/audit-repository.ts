export type AuditAction =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILURE'
  | 'LOGOUT'
  | 'PROJECT_CREATED'
  | 'PROJECT_UPDATED'
  | 'PROJECT_ARCHIVED'
  | 'PROJECT_RESTORED'
  | 'PROJECT_DELETED'
  | 'TASK_CREATED'
  | 'TASK_UPDATED'
  | 'TASK_DELETED';

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

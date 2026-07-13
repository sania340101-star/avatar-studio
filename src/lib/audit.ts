export type AuditEvent =
  | 'login_success'
  | 'login_failed'
  | 'sso_success'
  | 'sso_failed'
  | 'logout'
  | 'auth_failed'
  | 'rate_limited'
  | 'forbidden'
  | 'upload'
  | 'generate'
  | 'otp_sent'
  | 'seamless-loop';

interface AuditEntry {
  ts: string;
  event: AuditEvent;
  ip: string;
  userId?: string;
  path: string;
  detail?: string;
}

export function audit(entry: Omit<AuditEntry, 'ts'>) {
  try {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
    console.log(`[AUDIT] ${line}`);
  } catch {
    // never let logging break the app
  }
}

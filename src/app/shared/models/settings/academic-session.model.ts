/** Settings → Academic Sessions — the shapes of /api/v2/settings/academic-sessions. */

export type SessionStatus = 'active' | 'closed' | 'upcoming';

export interface AcademicSessionRow {
  _id: string;
  /** Server-computed "2026-2027" — never typed by the admin. */
  label: string;
  startDate: string;
  endDate: string;
  status: SessionStatus;
  isLocked: boolean;
  /** Records saved against an Upcoming session — non-zero means Delete will be refused. */
  blockingCount?: number;
}

export interface SessionListResponse {
  rows: AcademicSessionRow[];
  total: number;
  page: number;
  limit: number;
  summary: { total: number; activeLabel: string | null };
}

export interface CopyForwardOption {
  key: string;
  label: string;
  /** False while the owning module has no v2 collection yet. */
  available: boolean;
  reason: string | null;
}

export interface CopyForwardOptionsResponse {
  sourceLabel: string | null;
  options: CopyForwardOption[];
}

export interface CopyForwardResult {
  key: string;
  label: string;
  status: 'copied' | 'failed' | 'skipped';
  count: number;
  message?: string;
}

export interface CreateSessionPayload {
  adminId: string;
  startDate: string;
  endDate: string;
  copyForward: string[];
}

export interface CreateSessionResponse {
  message: string;
  session: AcademicSessionRow;
  copyForward: CopyForwardResult[];
  /** SESSION_COPY_FORWARD_PARTIAL — the session WAS created; these types failed. */
  warning?: { code: string; message: string; rows: { row: string; label: string; message: string }[] };
}

export interface ActivateSessionResponse {
  message: string;
  session: AcademicSessionRow;
  previousLabel: string | null;
}

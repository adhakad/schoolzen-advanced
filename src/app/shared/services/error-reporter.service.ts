/**
 * Sentry seam — the frontend twin of backend/modules/helpers/error-reporter.js.
 *
 * The error-handling architecture calls for @sentry/angular in production, but nothing
 * is installed or configured yet, so this logs to the console in development and is
 * otherwise a no-op. Every call site (error.interceptor.ts, global-error-handler.ts) is
 * written exactly as it would be with Sentry present, so switching it on later is
 * `npm i @sentry/angular@^7` plus a DSN — no call-site change.
 */
import { Injectable, isDevMode } from '@angular/core';

export interface ErrorReportTags {
  requestId?: string;
  category?: string;
  source?: string;
}

@Injectable({ providedIn: 'root' })
export class ErrorReporterService {
  captureException(error: unknown, tags: ErrorReportTags = {}): void {
    if (isDevMode()) {
      console.error('[error-reporter]', tags, error);
    }
  }

  captureMessage(message: string, tags: ErrorReportTags = {}): void {
    if (isDevMode()) {
      console.warn('[error-reporter]', tags, message);
    }
  }
}

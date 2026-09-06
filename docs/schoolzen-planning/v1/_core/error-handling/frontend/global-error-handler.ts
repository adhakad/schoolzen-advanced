/**
 * Catches uncaught RUNTIME errors - a bug in a component's template
 * or TypeScript code that throws, which never went through
 * error.interceptor.ts because it never made an HTTP call at all
 * (e.g. a null-reference in a component's ngOnInit). This is
 * Angular's designated extension point for exactly this case.
 *
 * npm install @sentry/angular
 */
import { ErrorHandler, Injectable, Injector } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import * as Sentry from '@sentry/angular';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  // Injector, not direct injection, because ErrorHandler is
  // constructed before Angular's normal DI timing in some setups.
  constructor(private injector: Injector) {}

  handleError(error: unknown): void {
    const requestId = uuidv4(); // no server round-trip happened, so this ID only ties the toast to the Sentry event, not a backend log line
    const snackBar = this.injector.get(MatSnackBar);

    console.error(error); // still useful in local dev tools

    Sentry.captureException(error, { tags: { requestId, source: 'frontend-runtime' } });

    snackBar.open(
      `Something went wrong. If this keeps happening, mention this reference: ${requestId}`,
      'Dismiss',
      { duration: 7000 }
    );
  }
}

/*
=== app.module.ts wiring (for reference, not part of this file's export) ===

providers: [
  { provide: ErrorHandler, useClass: GlobalErrorHandler }
]
*/

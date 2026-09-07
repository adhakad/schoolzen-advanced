/**
 * Catches uncaught RUNTIME errors — a bug in a component's template or TypeScript that
 * throws without ever making an HTTP call, so error.interceptor.ts never sees it.
 * Angular's designated extension point for exactly this case; registered in
 * app.module.ts as `{ provide: ErrorHandler, useClass: GlobalErrorHandler }`.
 */
import { ErrorHandler, Injectable, Injector } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { v4 as uuidv4 } from 'uuid';
import { ErrorReporterService } from 'src/app/shared/services/error-reporter.service';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  // Injector, not direct injection: ErrorHandler is constructed before Angular's normal
  // DI timing in some setups.
  constructor(private injector: Injector) {}

  handleError(error: unknown): void {
    // No server round-trip happened, so this ID ties the toast to the report only, not
    // to a backend log line.
    const requestId = uuidv4();

    console.error(error);
    this.injector.get(ErrorReporterService).captureException(error, {
      requestId,
      source: 'frontend-runtime'
    });

    this.injector.get(MatSnackBar).open(
      'Something went wrong. If this keeps happening, mention this reference: ' + requestId,
      'Dismiss',
      { duration: 7000 }
    );
  }
}

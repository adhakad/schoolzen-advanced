/**
 * THE single Angular HttpInterceptor every HTTP call passes through, registered once in
 * app.module.ts. No component's HTTP subscription needs its own error branch for the
 * common cases — ValidationError is the one category deliberately left to the calling
 * component, so it can show inline field errors from `fields` (see
 * docs/schoolzen-planning/v1/_core/error-handling/frontend/example-component-usage.ts).
 *
 * Three deliberate deviations from that reference file, each for a reason specific to
 * this codebase:
 *   1. Sentry goes through ErrorReporterService (no @sentry/angular installed yet).
 *   2. AuthenticationError redirects to /admin/login or /teacher/login — this app has
 *      no single /login route.
 *   3. An unshaped 401/403 is rethrown SILENTLY. Legacy endpoints answer with bare
 *      strings, and AdminAuthInterceptor refreshes the token on a 403 and retries the
 *      request; toasting there would fire a spurious "Something went wrong" on every
 *      normal token refresh. Any other unshaped error still gets the generic toast.
 */
import { Injectable } from '@angular/core';
import {
  HttpEvent, HttpHandler, HttpInterceptor, HttpRequest, HttpErrorResponse
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { v4 as uuidv4 } from 'uuid';
import { ApiError, ApiErrorResponse } from 'src/app/shared/models/api-error.model';
import { ErrorReporterService } from 'src/app/shared/services/error-reporter.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';

@Injectable()
export class ErrorInterceptor implements HttpInterceptor {
  constructor(
    private snackBar: MatSnackBar,
    private router: Router,
    private reporter: ErrorReporterService,
    private shellContext: ShellContextService
  ) {}

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    // Attach a correlation ID so a frontend crash and the backend error it may have
    // triggered can be tied together — the backend reuses this exact value.
    const requestId = req.headers.get('X-Request-Id') || uuidv4();
    const reqWithId = req.clone({ setHeaders: { 'X-Request-Id': requestId } });

    return next.handle(reqWithId).pipe(
      catchError((httpErr: HttpErrorResponse) => {
        const apiError: ApiError | undefined = (httpErr.error as ApiErrorResponse | null)?.error;

        if (!apiError) {
          // Legacy endpoint (bare-string body) or a transport failure.
          if (httpErr.status !== 401 && httpErr.status !== 403) {
            this.showGenericToast(requestId);
          }
          return throwError(() => httpErr);
        }

        this.handleByCategory(apiError);
        // The component still receives the typed ApiError, so a form can read
        // apiError.fields for its inline errors.
        return throwError(() => apiError);
      })
    );
  }

  private handleByCategory(apiError: ApiError): void {
    switch (apiError.category) {
      case 'ValidationError':
        // Deliberately NO toast — the calling component renders inline field errors.
        break;

      case 'AuthenticationError':
        // The redirect IS the feedback.
        this.router.navigate([this.loginRouteForActiveRole()]);
        break;

      case 'RateLimitError': {
        const wait = apiError.retryAfter ? ' Please wait ' + apiError.retryAfter + 's.' : '';
        this.snackBar.open(apiError.message + wait, 'Dismiss', { duration: 6000 });
        break;
      }

      case 'ConflictError':
      case 'NotFoundError':
      case 'PermissionError':
      case 'ExternalServiceError':
        // The server's message is already written to be user-safe.
        this.snackBar.open(apiError.message, 'Dismiss', { duration: 5000 });
        break;

      case 'InternalError':
      default:
        this.showGenericToast(apiError.requestId);
        break;
    }

    // Mirrors the backend's isOperational split — only genuine bugs are reported.
    if (apiError.category === 'InternalError') {
      this.reporter.captureMessage('API InternalError: ' + apiError.message, {
        requestId: apiError.requestId,
        category: apiError.category
      });
    }
  }

  private loginRouteForActiveRole(): string {
    return this.shellContext.activeRole() === 'teacher' ? '/teacher/login' : '/admin/login';
  }

  private showGenericToast(requestId: string): void {
    // The real error is never shown to the user for this category — only the request ID
    // a support engineer can search for.
    this.snackBar.open(
      'Something went wrong. If this keeps happening, mention this reference: ' + requestId,
      'Dismiss',
      { duration: 7000 }
    );
  }
}

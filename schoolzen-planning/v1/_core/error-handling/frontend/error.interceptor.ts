/**
 * THE single Angular HttpInterceptor every HTTP call passes through.
 * Registered once in app.module.ts (see wiring note at the bottom).
 * No component's HTTP subscription needs its own `.catchError()` for
 * the common cases described in ../README.md's "Frontend handling"
 * section - ValidationError is the one category a component still
 * handles itself (to show inline field errors), everything else is
 * fully handled here.
 *
 * npm install @sentry/angular
 */
import { Injectable } from '@angular/core';
import {
  HttpEvent, HttpHandler, HttpInterceptor, HttpRequest, HttpErrorResponse
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import * as Sentry from '@sentry/angular';
import { v4 as uuidv4 } from 'uuid';
import { ApiError, ApiErrorResponse } from './api-error.model';

@Injectable()
export class ErrorInterceptor implements HttpInterceptor {
  constructor(private snackBar: MatSnackBar, private router: Router) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Attach a request ID so a frontend crash and the backend error it
    // may have triggered can be correlated (see ../README.md's
    // "Correlation IDs" section) - reuse one already on the request
    // if a caller set it, otherwise generate one.
    const requestId = req.headers.get('X-Request-Id') || uuidv4();
    const reqWithId = req.clone({ setHeaders: { 'X-Request-Id': requestId } });

    return next.handle(reqWithId).pipe(
      catchError((httpErr: HttpErrorResponse) => {
        const apiError: ApiError | undefined = (httpErr.error as ApiErrorResponse)?.error;

        if (!apiError) {
          // The server didn't even return our error shape (network
          // failure, a proxy timeout, etc.) - treat like InternalError.
          this.showGenericToast(requestId);
          return throwError(() => httpErr);
        }

        this.handleByCategory(apiError);
        return throwError(() => apiError); // component still gets the typed ApiError to inspect if needed (e.g. ValidationError.fields)
      })
    );
  }

  private handleByCategory(apiError: ApiError) {
    switch (apiError.category) {
      case 'ValidationError':
        // Deliberately NO toast - the calling component reads
        // apiError.fields and shows inline errors, matching the app's
        // established "inline error, not a popup" convention for forms.
        break;

      case 'AuthenticationError':
        // The redirect IS the feedback - no toast needed.
        this.router.navigate(['/login']);
        break;

      case 'RateLimitError': {
        const wait = apiError.retryAfter ? ` Please wait ${apiError.retryAfter}s.` : '';
        this.snackBar.open(apiError.message + wait, 'Dismiss', { duration: 6000 });
        break;
      }

      case 'ConflictError':
      case 'NotFoundError':
      case 'PermissionError':
      case 'ExternalServiceError':
        // Server's message is already written to be user-safe -
        // shown directly, no translation/mapping needed.
        this.snackBar.open(apiError.message, 'Dismiss', { duration: 5000 });
        break;

      case 'InternalError':
      default:
        this.showGenericToast(apiError.requestId);
        break;
    }

    // Only unexpected categories get sent to Sentry from the frontend
    // too - mirrors the backend's isOperational split (see
    // ../backend/errors/AppError.js).
    if (apiError.category === 'InternalError') {
      Sentry.captureMessage(`API InternalError: ${apiError.message}`, {
        tags: { requestId: apiError.requestId }
      });
    }
  }

  private showGenericToast(requestId: string) {
    // The real error is never shown to the user for this category -
    // only logged, with the request ID a support engineer can search for.
    this.snackBar.open(
      `Something went wrong. If this keeps happening, mention this reference: ${requestId}`,
      'Dismiss',
      { duration: 7000 }
    );
  }
}

/*
=== app.module.ts wiring (for reference, not part of this file's export) ===

providers: [
  { provide: HTTP_INTERCEPTORS, useClass: ErrorInterceptor, multi: true }
]
*/

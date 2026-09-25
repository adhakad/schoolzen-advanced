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
import { TranslateService } from '@ngx-translate/core';
import { ApiError, ApiErrorResponse } from './api-error.model';

@Injectable()
export class ErrorInterceptor implements HttpInterceptor {
  constructor(
    private snackBar: MatSnackBar,
    private router: Router,
    private translate: TranslateService // i18n - see resolveMessage() below
  ) {}

  /**
   * The ONLY place an API error's text gets localized. Looks up
   * `errors.<code>` in the active locale's JSON (loaded via
   * ngx-translate, per state-management.md's i18n note); if that
   * module hasn't added a translation for this code yet, falls back
   * to the backend's English `message` rather than showing a raw,
   * untranslated key to the user - the exact bug found in the
   * i18next reference that was reviewed for this app (EN/HI key sets
   * that didn't match 1:1). A CI check (see additional-technical-
   * considerations.md) keeps `errors.*` key coverage complete across
   * locales so this fallback stays rare in practice, not routine.
   */
  private resolveMessage(code: string | null, fallback: string): string {
    if (!code) return fallback;
    const key = `errors.${code}`;
    const translated = this.translate.instant(key);
    return translated === key ? fallback : translated; // ngx-translate returns the key itself on a miss
  }

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
        const text = this.resolveMessage(apiError.code, apiError.message);
        const wait = apiError.retryAfter ? ` ${this.translate.instant('errors.RETRY_AFTER', { seconds: apiError.retryAfter })}` : '';
        this.snackBar.open(text + wait, 'Dismiss', { duration: 6000 });
        break;
      }

      case 'ConflictError':
      case 'NotFoundError':
      case 'PermissionError':
      case 'ExternalServiceError':
        // Localized via `code` when this locale has that key; the
        // server's English `message` is only the fallback, never
        // translated by the backend itself (see api-error.model.ts).
        this.snackBar.open(this.resolveMessage(apiError.code, apiError.message), 'Dismiss', { duration: 5000 });
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

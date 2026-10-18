import { HttpClient, HttpErrorResponse, HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Observable, catchError, finalize, map, shareReplay, switchMap, throwError } from 'rxjs';

// What every auth service (admin, teacher, sales) already exposes.
export interface TokenAuth {
  getAccessToken(): any;
  getRefreshToken(): any;
  storeAccessToken(token: string): void;
  logout(): void;
}

/**
 * THE one token-refresh rule for every login type (shared-fix1.md S1):
 *  - only a 401 (missing/expired/invalid access token) triggers a refresh;
 *  - one refresh in flight at a time, shared by every request that hit the 401;
 *  - the failed request is retried once with the new token;
 *  - refresh fails, or the retry is 401 again -> logout.
 * A 403 is a permission / business refusal and always reaches the page untouched.
 * `refreshUrl` must be a route the backend really mounts (backend/routes.js, /v1/...).
 */
export abstract class TokenRefreshInterceptor implements HttpInterceptor {
  protected abstract readonly refreshUrl: string;
  private refreshing$: Observable<string> | null = null;

  constructor(protected http: HttpClient, protected auth: TokenAuth) {}

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const accessToken = this.auth.getAccessToken()?.accessToken;
    if (!accessToken || request.url === this.refreshUrl) return next.handle(request);

    return next.handle(withToken(request, accessToken)).pipe(
      catchError((err: HttpErrorResponse) => {
        if (err.status !== 401) return throwError(() => err);
        return this.refreshAccessToken().pipe(
          catchError(() => {
            this.auth.logout();
            return throwError(() => err);
          }),
          switchMap((token) => next.handle(withToken(request, token)).pipe(
            catchError((retryErr: HttpErrorResponse) => {
              if (retryErr.status === 401) this.auth.logout();
              return throwError(() => retryErr);
            })
          ))
        );
      })
    );
  }

  private refreshAccessToken(): Observable<string> {
    if (!this.refreshing$) {
      const refreshToken = this.auth.getRefreshToken()?.refreshToken;
      this.refreshing$ = this.http.post<any>(this.refreshUrl, { token: refreshToken }).pipe(
        map((res) => {
          if (!res?.accessToken) throw new Error('No access token in refresh response');
          this.auth.storeAccessToken(res.accessToken);
          return res.accessToken as string;
        }),
        finalize(() => (this.refreshing$ = null)),
        shareReplay(1)
      );
    }
    return this.refreshing$;
  }
}

const withToken = (request: HttpRequest<unknown>, token: string) =>
  request.clone({ setHeaders: { Authorization: `Bearer ${token}` } });

import { Injectable } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor,
  HttpErrorResponse,
  HttpClient
} from '@angular/common/http';
import {catchError, Observable, switchMap, throwError} from 'rxjs';
import { AdminAuthService } from '../services/auth/admin-auth.service';
import { environment } from 'src/environments/environment';

@Injectable()
export class AdminAuthInterceptor implements HttpInterceptor {
  // The legacy admin auth router is mounted at /v1/admin (backend/routes.js) — the refresh
  // endpoint is POST /v1/admin/refresh, never under /api.
  url = `${environment.API_URL}/v1/admin`;
  refresh=false
  
  constructor(private http:HttpClient, private adminAuthService: AdminAuthService) {}

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {

    const accessToken = this.adminAuthService.getAccessToken()?.accessToken;
    
    if(accessToken){
      
      const req = request.clone({
        setHeaders:{
          authorization : `Bearer ${accessToken}`
        }
      })

      return next.handle(req).pipe(catchError((err: HttpErrorResponse) => {
        // Only an expired/missing token is refreshed. A v2 PermissionError is also a 403, but
        // it carries a shaped `{ error: { category } }` body and must reach the page as-is
        // (e.g. "Attendance can only be marked between …"), never be swallowed by a refresh.
        const shaped = Boolean(err.error && typeof err.error === 'object' && err.error.error && err.error.error.category);
        if (err.status === 403 && !shaped && !this.refresh) {
          this.refresh = true;
          const refreshToken = this.adminAuthService.getRefreshToken()?.refreshToken;
          return this.http.post(`${this.url}/refresh`, {token:refreshToken}).pipe(
            switchMap((res: any) => {
              this.refresh = false;
              const newAccessToken = res.accessToken
              this.adminAuthService.storeAccessToken(newAccessToken)
              return next.handle(request.clone({
                setHeaders: {
                  Authorization: `Bearer ${newAccessToken}`
                }
              }));
            }),
            // A failed refresh must not replace the original error with its own.
            catchError(() => {
              this.refresh = false;
              return throwError(() => err);
            })
          ) as Observable<HttpEvent<any>>;
        }
        this.refresh = false;
        return throwError(() => err);
      }));

    }

    return next.handle(request)

  }
}

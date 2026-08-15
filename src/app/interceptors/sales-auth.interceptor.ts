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
import { SalesAuthService } from '../services/auth/sales-auth.service';
import { environment } from 'src/environments/environment';

@Injectable()
export class SalesAuthInterceptor implements HttpInterceptor {
  // NOT /api/ — teacher's interceptor has that mismatch against its own service's /v1/
  // base; deliberately using /v1/ here to match the actually-mounted route.
  url = `${environment.API_URL}/v1/sales-user`;
  refresh=false

  constructor(private http:HttpClient, private salesAuthService: SalesAuthService) {}

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {

    const accessToken = this.salesAuthService.getAccessToken()?.accessToken;

    if(accessToken){

      const req = request.clone({
        setHeaders:{
          authorization : `Bearer ${accessToken}`
        }
      })

      return next.handle(req).pipe(catchError((err: HttpErrorResponse) => {
        if (err.status === 403 && !this.refresh) {
          this.refresh = true;
          const refreshToken = this.salesAuthService.getRefreshToken()?.refreshToken;
          return this.http.post(`${this.url}/refresh`, {token:refreshToken}).pipe(
            switchMap((res: any) => {
              const newAccessToken = res.accessToken
              this.salesAuthService.storeAccessToken(newAccessToken)
              return next.handle(request.clone({
                setHeaders: {
                  Authorization: `Bearer ${newAccessToken}`
                }
              }));
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

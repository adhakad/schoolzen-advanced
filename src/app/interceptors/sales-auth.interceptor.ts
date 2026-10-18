import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { SalesAuthService } from '../services/auth/sales-auth.service';
import { TokenRefreshInterceptor } from 'src/app/shared/interceptors/token-refresh.interceptor';
import { environment } from 'src/environments/environment';

@Injectable()
export class SalesAuthInterceptor extends TokenRefreshInterceptor {
  // backend/routes.js mounts the sales auth router at /v1/sales-user.
  protected readonly refreshUrl = `${environment.API_URL}/v1/sales-user/refresh`;

  constructor(http: HttpClient, salesAuthService: SalesAuthService) {
    super(http, salesAuthService);
  }
}

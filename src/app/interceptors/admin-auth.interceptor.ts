import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AdminAuthService } from '../services/auth/admin-auth.service';
import { TokenRefreshInterceptor } from 'src/app/shared/interceptors/token-refresh.interceptor';
import { environment } from 'src/environments/environment';

@Injectable()
export class AdminAuthInterceptor extends TokenRefreshInterceptor {
  // backend/routes.js mounts the admin auth router at /v1/admin.
  protected readonly refreshUrl = `${environment.API_URL}/v1/admin/refresh`;

  constructor(http: HttpClient, adminAuthService: AdminAuthService) {
    super(http, adminAuthService);
  }
}

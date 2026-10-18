import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { TeacherAuthService } from '../services/auth/teacher-auth.service';
import { TokenRefreshInterceptor } from 'src/app/shared/interceptors/token-refresh.interceptor';
import { environment } from 'src/environments/environment';

@Injectable()
export class TeacherAuthInterceptor extends TokenRefreshInterceptor {
  // backend/routes.js mounts the teacher auth router at /v1/teacher-user (was /api/teacher-user, a 404).
  protected readonly refreshUrl = `${environment.API_URL}/v1/teacher-user/refresh`;

  constructor(http: HttpClient, teacherAuthService: TeacherAuthService) {
    super(http, teacherAuthService);
  }
}

import { TestBed } from '@angular/core/testing';
import { HTTP_INTERCEPTORS, HttpClient } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AdminAuthService } from '../services/auth/admin-auth.service';
import { AdminAuthInterceptor } from './admin-auth.interceptor';

// attendance-fix2.md Part D: a v2 PermissionError (shaped 403) must reach the page as-is, and
// only an expired token is refreshed — at the route the backend really has, /v1/admin/refresh.
describe('AdminAuthInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  const auth = {
    getAccessToken: () => ({ accessToken: 'old' }),
    getRefreshToken: () => ({ refreshToken: 'r' }),
    storeAccessToken: jasmine.createSpy('storeAccessToken')
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        { provide: AdminAuthService, useValue: auth },
        { provide: HTTP_INTERCEPTORS, useClass: AdminAuthInterceptor, multi: true }
      ]
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('a shaped PermissionError 403 is passed through, with no refresh call', () => {
    let received: any;
    http.post('http://localhost:3000/api/v2/attendance/mark', {}).subscribe({ error: (e) => (received = e) });
    backend.expectOne('http://localhost:3000/api/v2/attendance/mark')
      .flush({ error: { category: 'PermissionError', message: 'Outside the window.' } }, { status: 403, statusText: 'Forbidden' });
    backend.expectNone((req) => req.url.includes('/refresh'));
    expect(received.error.error.message).toBe('Outside the window.');
  });

  it('an expired token refreshes at /v1/admin/refresh and retries once', () => {
    let body: any;
    http.get('http://localhost:3000/api/v2/attendance/grid').subscribe((res) => (body = res));
    backend.expectOne('http://localhost:3000/api/v2/attendance/grid').flush({ name: 'TokenExpiredError' }, { status: 403, statusText: 'Forbidden' });
    backend.expectOne('http://localhost:3000/v1/admin/refresh').flush({ accessToken: 'new' });
    const retry = backend.expectOne('http://localhost:3000/api/v2/attendance/grid');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer new');
    retry.flush({ rows: [] });
    expect(body).toEqual({ rows: [] });
  });

  it('a failed refresh hands back the ORIGINAL error, not the refresh error', () => {
    let received: any;
    http.post('http://localhost:3000/api/v2/attendance/sync', {}).subscribe({ error: (e) => (received = e) });
    backend.expectOne('http://localhost:3000/api/v2/attendance/sync').flush('Token Unavailable', { status: 403, statusText: 'Forbidden' });
    backend.expectOne('http://localhost:3000/v1/admin/refresh').flush({ error: { category: 'NotFoundError', message: 'Route not found' } }, { status: 404, statusText: 'Not Found' });
    expect(received.status).toBe(403);
    expect(received.error).toBe('Token Unavailable');
  });
});

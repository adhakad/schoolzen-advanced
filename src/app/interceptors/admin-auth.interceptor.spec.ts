import { TestBed } from '@angular/core/testing';
import { HTTP_INTERCEPTORS, HttpClient } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AdminAuthService } from '../services/auth/admin-auth.service';
import { AdminAuthInterceptor } from './admin-auth.interceptor';

// shared-fix1.md S1: only a 401 refreshes (once, retry once, else logout); a 403 is a refusal
// that reaches the page; the refresh URL is the one backend/routes.js mounts (/v1/admin).
describe('AdminAuthInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let auth: any;
  const grid = 'http://localhost:3000/api/v2/attendance/grid';
  const refreshUrl = 'http://localhost:3000/v1/admin/refresh';

  beforeEach(() => {
    auth = {
      getAccessToken: () => ({ accessToken: 'old' }),
      getRefreshToken: () => ({ refreshToken: 'r' }),
      storeAccessToken: jasmine.createSpy('storeAccessToken'),
      logout: jasmine.createSpy('logout')
    };
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

  it('401 -> one refresh -> retry succeeds', () => {
    let body: any;
    http.get(grid).subscribe((res) => (body = res));
    backend.expectOne(grid).flush({ name: 'TokenExpiredError' }, { status: 401, statusText: 'Unauthorized' });
    backend.expectOne(refreshUrl).flush({ accessToken: 'new' });
    const retry = backend.expectOne(grid);
    expect(retry.request.headers.get('Authorization')).toBe('Bearer new');
    retry.flush({ rows: [] });
    expect(body).toEqual({ rows: [] });
    expect(auth.storeAccessToken).toHaveBeenCalledWith('new');
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it('two parallel 401s share ONE refresh', () => {
    http.get(grid).subscribe();
    http.get(grid + '?b').subscribe();
    backend.expectOne(grid).flush('', { status: 401, statusText: 'Unauthorized' });
    backend.expectOne(grid + '?b').flush('', { status: 401, statusText: 'Unauthorized' });
    backend.expectOne(refreshUrl).flush({ accessToken: 'new' });
    backend.expectOne(grid).flush({});
    backend.expectOne(grid + '?b').flush({});
  });

  it('401 + refresh fails -> logout, original error returned', () => {
    let received: any;
    http.post(grid, {}).subscribe({ error: (e) => (received = e) });
    backend.expectOne(grid).flush('Token Unavailable', { status: 401, statusText: 'Unauthorized' });
    backend.expectOne(refreshUrl).flush('Session expired!', { status: 401, statusText: 'Unauthorized' });
    expect(auth.logout).toHaveBeenCalledTimes(1);
    expect(received.status).toBe(401);
    expect(received.error).toBe('Token Unavailable');
  });

  it('403 -> no refresh, message reaches the page', () => {
    let received: any;
    http.post('http://localhost:3000/api/v2/attendance/mark', {}).subscribe({ error: (e) => (received = e) });
    backend.expectOne('http://localhost:3000/api/v2/attendance/mark')
      .flush({ error: { category: 'PermissionError', message: 'Outside the window.' } }, { status: 403, statusText: 'Forbidden' });
    backend.expectNone((req) => req.url.includes('/refresh'));
    expect(received.error.error.message).toBe('Outside the window.');
    expect(auth.logout).not.toHaveBeenCalled();
  });
});

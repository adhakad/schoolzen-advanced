import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from 'src/environments/environment';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { PunchEvent } from 'src/app/modal/attendance.model';

// The frontend end of the Phase 6/7 fast path: WDMS punch -> PunchLog insert -> Redis publish
// -> backend/modules/sockets/punch-subscriber.js -> this socket -> the page, with no polling
// anywhere in the chain.
//
// Not a per-resource HTTP service like the rest of services/ — there is no /v1/... URL behind
// it. It wraps one shared connection so both the live board and the attendance grid listen to
// the same stream instead of opening a socket each.

@Injectable({
  providedIn: 'root'
})
export class AttendanceSocketService {
  private socket: Socket | null = null;
  private punch = new Subject<PunchEvent>();
  private connected = new BehaviorSubject<boolean>(false);

  constructor(private adminAuthService: AdminAuthService) {
    // Logout is the only teardown that matters. Pages come and go — they unsubscribe from the
    // observables below in ngOnDestroy but deliberately do NOT disconnect, so navigating
    // between the live board and the calendar doesn't tear down and rebuild the connection.
    this.adminAuthService.getAuthStatusListener().subscribe((isAuthenticated) => {
      if (!isAuthenticated) this.disconnect();
    });
  }

  // Idempotent — every page calls it in ngOnInit and the second call onwards is a no-op.
  connect(): void {
    if (this.socket) return;

    this.socket = io(environment.API_URL, {
      // The FUNCTION form, not a static object. AdminAuthInterceptor silently refreshes the
      // access token on a 403, so a socket that captured the token once at page load would
      // reconnect hours later replaying a dead one. Re-reading the cookie per attempt means a
      // reconnect always presents the current token.
      auth: (cb) => cb({ token: this.adminAuthService.getAccessToken()?.accessToken }),
    });

    this.socket.on('connect', () => this.connected.next(true));
    this.socket.on('disconnect', () => this.connected.next(false));
    // Fires when the backend's io.use() refuses the handshake — a missing or expired token.
    this.socket.on('connect_error', () => this.connected.next(false));

    this.socket.on('attendance:punch', (event: PunchEvent) => this.punch.next(event));
  }

  disconnect(): void {
    if (!this.socket) return;
    this.socket.removeAllListeners();
    this.socket.disconnect();
    this.socket = null;
    this.connected.next(false);
  }

  // The room the backend put this connection in is derived from the JWT, so everything
  // arriving here already belongs to the logged-in school — there is no school filtering to
  // do on this side.
  onPunch(): Observable<PunchEvent> {
    return this.punch.asObservable();
  }

  onConnected(): Observable<boolean> {
    return this.connected.asObservable();
  }
}

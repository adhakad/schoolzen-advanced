import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from 'src/environments/environment';
import { TeacherAuthService } from 'src/app/services/auth/teacher-auth.service';
import { PunchEvent, ReconcileEvent } from 'src/app/modal/attendance.model';

// The teacher panel's end of the same punch stream services/attendance-socket.service.ts
// carries for admins. A sibling rather than a shared base class because the only difference is
// which auth service supplies the token, and AdminAuthService and TeacherAuthService have no
// common interface to abstract over — the same duplication admin-auth/teacher-auth already runs
// end to end through this codebase.
//
// WHAT IS DIFFERENT FROM THE ADMIN ONE, beyond the token: nothing on this side. The scoping is
// entirely server-side. middleware/socket-auth.js reads the teacher's attendancePermission and
// sockets/socket-server.js joins them to one `school:<adminId>:class:<n>` room per permitted
// class, so a teacher only ever RECEIVES their own classes' punches. There is no client-side
// filter here to forget, and no way for the page to ask for a class it was not granted.

@Injectable({
  providedIn: 'root'
})
export class TeacherAttendanceSocketService {
  private socket: Socket | null = null;
  private punch = new Subject<PunchEvent>();
  private reconciled = new Subject<ReconcileEvent>();
  private connected = new BehaviorSubject<boolean>(false);

  constructor(private teacherAuthService: TeacherAuthService) {
    // Logout is the only teardown that matters — pages unsubscribe in ngOnDestroy but
    // deliberately do NOT disconnect, so navigating around the teacher panel does not tear
    // down and rebuild the connection.
    this.teacherAuthService.getAuthStatusListener().subscribe((isAuthenticated) => {
      if (!isAuthenticated) this.disconnect();
    });
  }

  // Idempotent — the second call onwards is a no-op.
  connect(): void {
    if (this.socket) return;

    this.socket = io(environment.API_URL, {
      // The FUNCTION form, not a static object. The token is refreshed behind the page's back,
      // so a socket that captured it once at load would reconnect hours later replaying a dead
      // one. Re-reading per attempt means a reconnect always presents the current token.
      auth: (cb) => cb({ token: this.teacherAuthService.getAccessToken()?.accessToken }),
    });

    this.socket.on('connect', () => this.connected.next(true));
    this.socket.on('disconnect', () => this.connected.next(false));
    // Fires when the backend's io.use() refuses the handshake — a missing or expired token.
    this.socket.on('connect_error', () => this.connected.next(false));

    this.socket.on('attendance:punch', (event: PunchEvent) => this.punch.next(event));
    this.socket.on('attendance:reconciled', (event: ReconcileEvent) => this.reconciled.next(event));
  }

  disconnect(): void {
    if (!this.socket) return;
    this.socket.removeAllListeners();
    this.socket.disconnect();
    this.socket = null;
    this.connected.next(false);
  }

  onPunch(): Observable<PunchEvent> {
    return this.punch.asObservable();
  }

  onReconciled(): Observable<ReconcileEvent> {
    return this.reconciled.asObservable();
  }

  onConnected(): Observable<boolean> {
    return this.connected.asObservable();
  }
}

/**
 * Follows a background job until it finishes — the client half of every "202 + jobId"
 * endpoint (Excel import, card device-sync, Class Promotion). Polls rather than holding a
 * socket: these jobs take seconds, and the page only cares while its modal is open.
 */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, timer } from 'rxjs';
import { switchMap, takeWhile } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { JobStatus } from 'src/app/shared/models/student/student.model';

const FINISHED = new Set(['completed', 'failed']);

@Injectable({ providedIn: 'root' })
export class JobStatusService {
  constructor(private http: HttpClient) {}

  /**
   * Emits each status and completes after the one whose state is completed/failed.
   * @param module the API module that owns the job, e.g. 'student'
   */
  watch<T>(module: string, adminId: string, jobId: string, intervalMs = 1500): Observable<JobStatus<T>> {
    const url = `${environment.API_URL}/api/v2/${module}/jobs/${encodeURIComponent(jobId)}`;
    return timer(0, intervalMs).pipe(
      switchMap(() => this.http.get<JobStatus<T>>(url, { params: { adminId } })),
      takeWhile((status) => !FINISHED.has(status.state), true)
    );
  }
}

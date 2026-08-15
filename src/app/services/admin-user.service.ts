import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { AdminDirectoryEntry } from '../modal/admin.model';


@Injectable({
  providedIn: 'root'
})
export class AdminUserService {

  url = `${environment.API_URL}/v1/admin`;
  constructor(private http: HttpClient) { }
  // Sales-only — used by Device Management's assign-to-school picker. Auth header comes
  // from whichever interceptor finds its own cookie present (SalesAuthInterceptor here).
  getAdminDirectory(search?: string) {
    return this.http.get<AdminDirectoryEntry[]>(`${this.url}/admin-directory`, { params: search ? { search } : {} });
  }
  getSingleAdminUser(adminId: any) {
    return this.http.get(`${this.url}/admin-user/${adminId}`);
  }
  getAdminPaymentStepStatus(stepId: string) {
    return this.http.get(`${this.url}/admin-user/step/${stepId}`);
  }
  updateAdminDetail(adminDetailData: any) {
    console.log(adminDetailData)
    return this.http.put(`${this.url}/admin-detail/${adminDetailData._id}`, adminDetailData);
  }
  sendWhatsappOtp(mobile: number): Observable<any> {
    return this.http.post(`${this.url}/send-whatsapp-otp`, { mobile }).pipe(
      tap(response => {
        console.log('OTP send/resend successful:', response);
      }),
      catchError(error => {
        console.error('Error sending OTP:', error);
        return throwError(() => error);
      })
    );
  }
}
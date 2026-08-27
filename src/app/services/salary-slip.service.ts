import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { SalarySlipPayload } from '../modal/salary-slip.model';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SalarySlipService {
  url = `${environment.API_URL}/v1/salary-slip`;
  constructor(private http: HttpClient) { }

  // Issues a slip if there is not one, refreshes it if there is — either way it returns the
  // full render payload. Refused unless the payroll is LOCKED and has a payment against it.
  generateSalarySlip(data: any) {
    return this.http.post<SalarySlipPayload>(`${this.url}/generate`, data);
  }
  // Resolves to null when no slip has been issued for that payroll yet, so the caller can
  // decide between Generate and Print without handling a 404.
  getSalarySlipForPayroll(adminId: any, payrollId: any) {
    return this.http.get<SalarySlipPayload>(`${this.url}/payroll/${adminId}/${payrollId}`);
  }
}

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BulkGenerateResult, Payroll } from '../modal/payroll.model';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class PayrollService {
  url = `${environment.API_URL}/v1/payroll`;
  constructor(private http: HttpClient) { }

  payrollPaginationList(data: any) {
    return this.http.post(`${this.url}/payroll-pagination`, data);
  }
  // { adminId, staffId, month, year }. Refused with a 400 if the record is already LOCKED.
  generatePayroll(data: any) {
    return this.http.post(`${this.url}/generate`, data);
  }
  // { adminId, month, year, staffIds }. Staff who cannot be generated come back in `skipped`
  // rather than failing the whole batch.
  bulkGeneratePayroll(data: any) {
    return this.http.post<BulkGenerateResult>(`${this.url}/bulk-generate`, data);
  }
  getSinglePayroll(id: String) {
    return this.http.get<Payroll>(`${this.url}/${id}`);
  }
  lockPayroll(id: String, data: any) {
    return this.http.put(`${this.url}/${id}/lock`, data);
  }
  // `confirm: true` is REQUIRED by the backend schema — the confirmation checkbox in the UI
  // is what sets it, and a request without it is rejected before reaching the handler.
  unlockPayroll(id: String, data: any) {
    return this.http.put(`${this.url}/${id}/unlock`, data);
  }
}

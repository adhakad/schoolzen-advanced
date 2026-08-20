import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class BiometricMappingService {
  url = `${environment.API_URL}/v1/biometric-mapping`;
  constructor(private http: HttpClient) { }

  assignCard(data: any) {
    return this.http.post(`${this.url}/assign-card`, data);
  }
  bulkAssignCard(data: any) {
    return this.http.post(`${this.url}/bulk-assign-card`, data);
  }
  // Re-push this person's WDMS employee record and tell the school's terminals to pull it.
  // data: { adminId, personType, personId, verifyMode? } — sending verifyMode also saves it.
  resyncToDevice(data: any) {
    return this.http.post(`${this.url}/resync`, data);
  }
}

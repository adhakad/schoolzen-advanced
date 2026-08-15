import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Device } from '../modal/device.model';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class DeviceService {
  url = `${environment.API_URL}/v1/device`;
  constructor(private http: HttpClient) { }

  syncFromWdms() {
    return this.http.post(`${this.url}/sync`, {});
  }
  getUnassignedDevices() {
    return this.http.get<Device[]>(`${this.url}/unassigned`);
  }
  assignDevice(assignData: { deviceId: String, schoolId: String }) {
    return this.http.post(`${this.url}/assign`, assignData);
  }
  activateDevice(id: String) {
    return this.http.put(`${this.url}/activate/${id}`, {});
  }
  blockDevice(id: String) {
    return this.http.put(`${this.url}/block/${id}`, {});
  }
  getDevicesBySalesPerson() {
    return this.http.get<Device[]>(`${this.url}/by-sales-person`);
  }
  getSchoolWiseDevices() {
    return this.http.get<any[]>(`${this.url}/school-wise`);
  }
}

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AdminPlanService {

  url = `${environment.API_URL}/v1/admin`;
  constructor(private http: HttpClient) { }
  getSingleAdminPlan(adminId: any) {
    return this.http.get(`${this.url}/admin-plan/${adminId}`);
  }
}

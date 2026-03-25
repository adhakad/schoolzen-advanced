import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Plans } from '../modal/plans.model';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class PlansService {
  url = `${environment.API_URL}/v1/plans`;
  constructor(private http: HttpClient) { }

  addPlans(planData: Plans) {
    return this.http.post(this.url, planData);
  }
  getPlansList() {
    return this.http.get<Plans[]>(this.url);
  }
  getPlansCount() {
    return this.http.get(`${this.url}/plans-count`);
  }
  getSinglePlans(id: any) {
    return this.http.get<Plans[]>(`${this.url}/${id}`);
  }
  getSinglePlansByPlans(plans: any) {
    return this.http.get<any>(`${this.url}/plans/${plans}`);
  }
  plansPaginationList(plansData: any) {
    return this.http.post(`${this.url}/plans-pagination`, plansData);
  }
  updatePlans(plansData: Plans) {
    return this.http.put(`${this.url}/${plansData._id}`, plansData);
  }
  deletePlans(id: String) {
    return this.http.delete(`${this.url}/${id}`);
  }
}

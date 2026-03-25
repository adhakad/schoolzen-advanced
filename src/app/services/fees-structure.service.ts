import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';


@Injectable({
  providedIn: 'root'
})
export class FeesStructureService {
  url = `${environment.API_URL}/v1/fees-structure`;
  constructor(private http: HttpClient) { }

  addFeesStructure(feesForm: any) {
    return this.http.post(`${this.url}`, feesForm);
  }
  feesStructureByClass(params: any) {
    return this.http.get(`${this.url}/admin/${params.adminId}`);
  }
  feesStructureBySession(params: any) {
    return this.http.get(`${this.url}/admin/${params.adminId}/session/${params.session}`);
  }
  feesStructureByClassStream(params: any) {
    return this.http.get(`${this.url}/admin/${params.adminId}/class/${params.class}/stream/${params.stream}`);
  }

  // addBulkFees(feesBulkResult:any) {
  //   return this.http.post(`${this.url}/bulk-fees`,feesBulkResult);
  // }
  // feesPaginationList(feesData:any){
  //   return this.http.post(`${this.url}/fees-pagination`,feesData);
  // }
  // updateFees(feesForm:any){
  //   return this.http.put(`${this.url}`,feesForm);
  // }

  deleteFeesStructure(id: any) {
    return this.http.delete(`${this.url}/${id}`);
  }
}

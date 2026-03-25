import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';


@Injectable({
  providedIn: 'root'
})
export class FeesService {
  url = `${environment.API_URL}/v1/fees`;
  constructor(private http: HttpClient) { }

  addFees(feesForm: any) {
    return this.http.post(`${this.url}`, feesForm);
  }
  addAdmissionFees(feesForm: any) {
    return this.http.post(`${this.url}/admission-fees`, feesForm);
  }
  // addBulkFees(feesBulkResult:any) {
  //   return this.http.post(`${this.url}/bulk-fees`,feesBulkResult);
  // }
  getAllStudentFeesCollectionByClass(params: any) {
    return this.http.get(`${this.url}/admin/${params.adminId}/class/${params.class}/stream/${params.stream}`);
  }
  singleStudentFeesCollectionByStudentId(params: any) {
    return this.http.get(`${this.url}/admin/${params.adminId}/student/fees-statemant/${params.id}`);
  }

  feesCollectionBySession(params: any) {
    return this.http.get(`${this.url}/admin/${params.adminId}/session/${params.session}`);
  }

  singleStudentFeesCollectionById(params: any) {
    return this.http.get(`${this.url}/admin/${params.adminId}/fees/student/${params.studentId}`);
  }
  payableSingleStudentFeesCollectionById(studentId: any) {
    return this.http.get(`${this.url}/payable/student/${studentId}`);
  }
  // feesPaginationList(feesData:any){
  //   return this.http.post(`${this.url}/fees-pagination`,feesData);
  // }
  // updateFees(feesForm:any){
  //   return this.http.put(`${this.url}`,feesForm);
  // }
  // resultsByClass(cls: any) {
  //   return this.http.get(`${this.url}/student-results/${cls}`);
  // }
  // deleteFees(id:any){
  //   return this.http.delete(`${this.url}/${id}`);
  // }

}
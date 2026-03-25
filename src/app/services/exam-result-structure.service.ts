import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ExamResultStructureService {
  url = `${environment.API_URL}/v1/exam-result-structure`;
  constructor(private http: HttpClient) { }

  addExamResultStructure(examResultForm:any) {
    return this.http.post(`${this.url}`,examResultForm);
  }
  getSingleClassMarksheetTemplateByStream(params: any) {
    return this.http.get(`${this.url}/admin/${params.adminId}/class/${params.cls}/stream/${params.stream}`);
  }
  getSingleMarksheetTemplateById(id: any) {
    return this.http.get(`${this.url}/admin/template/structure/${id}`);
  }
  getSingleClassResultStrucByStream(params: any) {
    return this.http.get(`${this.url}/admin/${params.adminId}/template/structure/class/${params.cls}/stream/${params.stream}`);
  }
  changeResultPublishStatus(params:any){
    return this.http.put(`${this.url}/result-publish-status/${params.id}`,params);
  }
  updateMarksheetTemplateStructure(formData:any){
      return this.http.put(`${this.url}/template/structure/${formData._id}`, formData);
    }
  deleteResultStructure(id:any){
    return this.http.delete(`${this.url}/${id}`);
  }
}
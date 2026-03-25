import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Teacher } from '../modal/teacher.model';
import { environment } from 'src/environments/environment';


@Injectable({
  providedIn: 'root'
})
export class TeacherService {
  url = `${environment.API_URL}/v1/teacher`;
  constructor(private http:HttpClient) { }

  addTeacher(formData:any){
    // var formData: any = new FormData();
    // formData.append('name',teacherData.name);
    // formData.append('teacherUserId',teacherData.teacherUserId);
    // formData.append('education',teacherData.education);
    // formData.append('image',teacherData.image);
    return this.http.post(this.url,formData);
  }
  addTeacherPermission(formData:any){
    return this.http.put(`${this.url}/permission/admin/${formData.adminId}/teacher/${formData._id}`,formData);
  }
  getTeacherById(params:any) {
    return this.http.get<any[]>(`${this.url}/admin/${params.adminId}/teacher/${params.teacherUserId}`);
  }
  getTeacherCount(params:any) {
    return this.http.get(`${this.url}/teacher-count/${params.adminId}`);
  }
  teacherPaginationList(teacherData:any){
    return this.http.post(`${this.url}/teacher-pagination`,teacherData);
  }
  updateTeacher(teacherData:Teacher){
    return this.http.put(`${this.url}/${teacherData._id}`, teacherData);
  }
  changeStatus(params:any){
    return this.http.put(`${this.url}/status/${params.id}`,params);
  }
  deleteTeacher(id:String){
    return this.http.delete(`${this.url}/${id}`);
  }
}

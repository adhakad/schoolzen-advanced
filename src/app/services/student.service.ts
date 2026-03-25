import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Student } from '../modal/student.modal';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class StudentService {
  url = `${environment.API_URL}/v1/student`;
  constructor(private http: HttpClient) { }

  private cleanObject(obj: any): any {
    return Object.fromEntries(
      Object.entries(obj).filter(([_, v]) => v !== null && v !== 'null' && v !== '' && v !== undefined && v !== "undefined")
    );
  }

  addStudent(studentData: any) {

    studentData = this.cleanObject(studentData);

    if (studentData.studentImage && typeof studentData.studentImage !== 'string') {
      const formData = new FormData();
      formData.append('studentImage', studentData.studentImage);

      Object.entries(studentData).forEach(([key, value]) => {
        if (key !== 'studentImage') {
          formData.append(key, value as any);
        }
      });
      return this.http.post(this.url, formData);
    } else {
      return this.http.post(this.url, studentData);
    }
  }
  addOnlineAdmission(studentData: any) {
    return this.http.post(`${this.url}/online-admission`, studentData);
  }
  addBulkStudentRecord(bulkStudentRecord: any) {
    return this.http.post(`${this.url}/bulk-student-record`, bulkStudentRecord);
  }
  getStudentList() {
    return this.http.get<Student[]>(this.url);
  }
  getStudentByClass(params: any) {
    return this.http.get(`${this.url}/admin/${params.adminId}/student/${params.class}/stream/${params.stream}`);
  }
  getStudentByClassWithoutStream(params: any) {
    console.log(params)
    return this.http.get(`${this.url}/admin/${params.adminId}/student/${params.class}`);
  }
  getStudentCount(params: any) {
    return this.http.get(`${this.url}/student-count/${params.adminId}`);
  }
  studentPaginationList(studentData: any) {
    return this.http.post(`${this.url}/student-pagination`, studentData);
  }
  studentPaginationByAdmission(studentData: any) {
    return this.http.post(`${this.url}/student-admission-pagination`, studentData);
  }
  studentPaginationByAdmissionAndClass(studentData: any) {
    return this.http.post(`${this.url}/student-admission-pagination/class`, studentData);
  }
  studentAdmissionEnquiryPagination(studentData: any) {
    return this.http.post(`${this.url}/student-admission-enquiry-pagination`, studentData);
  }
  updateStudent(studentData: any) {

    studentData = this.cleanObject(studentData);
    if (studentData.studentImage && typeof studentData.studentImage !== 'string') {
      const formData = new FormData();
      formData.append('studentImage', studentData.studentImage);
      Object.entries(studentData).forEach(([key, value]) => {
        if (key !== 'studentImage') {
          formData.append(key, value as any);
        }
      });
      return this.http.put(`${this.url}/${studentData._id}`, formData);
    } else {
      return this.http.put(`${this.url}/${studentData._id}`, studentData);
    }
  }
  changeStatus(params: any) {
    return this.http.put(`${this.url}/status/${params.id}`, params);
  }
  deleteStudent(id: String) {
    return this.http.delete(`${this.url}/${id}`);
  }
  deletedeleteAdmissionEnquiry(id: String) {
    return this.http.delete(`${this.url}/admission-enquiry/${id}`);
  }
  studentClassPromote(studentData: any) {
    return this.http.put(`${this.url}/class-promote/${studentData._id}`, studentData);
  }
  studentClassFail(studentData: any) {
    return this.http.put(`${this.url}/class-fail/${studentData._id}`, studentData);
  }
}

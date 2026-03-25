import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';

@Injectable({
  providedIn: 'root'
})
export class SchoolService {
  url = `${environment.API_URL}/v1/school`;
  private schoolData: any = null;

  constructor(private http: HttpClient) { }

  getSchoolNameLogo() {
    return this.http.get<any>(`${this.url}/name-logo`);
  }

  addSchool(schoolData: any) {
    if (schoolData.schoolLogo && typeof schoolData.schoolLogo !== 'string') {
      const formData = new FormData();
      formData.append('schoolLogo', schoolData.schoolLogo);
      Object.keys(schoolData).forEach(key => {
        if (key !== 'schoolLogo') {
          formData.append(key, schoolData[key]);
        }
      });
      return this.http.post(this.url, formData);
    } else {
      return this.http.post(this.url, schoolData);
    }
  }

  getSchool(adminId: any) {
    return this.http.get<any>(`${this.url}/${adminId}`);
  }

  setSchoolData(data: any) {
    this.schoolData = data;
  }

  getSchoolData() {
    return this.schoolData;
  }

  updateSchool(schoolData: any) {
    if (schoolData.schoolLogo && typeof schoolData.schoolLogo !== 'string') {
      const formData = new FormData();
      formData.append('schoolLogo', schoolData.schoolLogo);
      Object.keys(schoolData).forEach(key => {
        if (key !== 'schoolLogo') {
          formData.append(key, schoolData[key]);
        }
      });
      return this.http.put(`${this.url}/${schoolData._id}`, formData);
    } else {
      return this.http.put(`${this.url}/${schoolData._id}`, schoolData);
    }
  }

  deleteSchool(id: String) {
    return this.http.delete(`${this.url}/${id}`);
  }
}
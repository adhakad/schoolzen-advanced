import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Topper } from '../modal/topper.model';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class TopperService {
  url = `${environment.API_URL}/v1/topper`;
  constructor(private http:HttpClient) { }

  addTopper(topperData:Topper){
    var formData: any = new FormData();
    formData.append('name', topperData.name);
    formData.append('class', topperData.class);
    formData.append('percentile', topperData.percentile);
    formData.append('year', topperData.year);
    formData.append('image', topperData.image);
    return this.http.post(this.url,formData);
  }
  getTopperList() {
    return this.http.get<Topper[]>(this.url);
  }
  getTopperCount() {
    return this.http.get(`${this.url}/topper-count`);
  }
  topperPaginationList(topperData:any){
    return this.http.post(`${this.url}/topper-pagination`,topperData);
  }
  updateTopper(topperData:Topper){
    return this.http.put(`${this.url}/${topperData._id}`, topperData);
  }
  deleteTopper(id:String){
    return this.http.delete(`${this.url}/${id}`);
  }
}

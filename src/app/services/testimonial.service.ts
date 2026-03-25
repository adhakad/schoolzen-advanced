import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Testimonial } from '../modal/testimonial.model';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class TestimonialService {
  url = `${environment.API_URL}/v1/testimonial`;
  constructor(private http:HttpClient) { }

  addTestimonial(testimonialData:Testimonial){
    var formData: any = new FormData();
    formData.append('name', testimonialData.name);
    formData.append('role', testimonialData.role);
    formData.append('desc', testimonialData.desc);
    formData.append('image', testimonialData.image);
    return this.http.post(this.url,formData);
  }
  getTestimonialList() {
    return this.http.get<Testimonial[]>(this.url);
  }
  getTestimonialCount() {
    return this.http.get(`${this.url}/testimonial-count`);
  }
  testimonialPaginationList(testimonialData:any){
    return this.http.post(`${this.url}/testimonial-pagination`,testimonialData);
  }
  updateTestimonial(testimonialData:Testimonial){
    return this.http.put(`${this.url}/${testimonialData._id}`, testimonialData);
  }
  deleteTestimonial(id:String){
    return this.http.delete(`${this.url}/${id}`);
  }
}

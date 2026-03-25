import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Banner } from '../modal/banner.model';
import { environment } from 'src/environments/environment';


@Injectable({
  providedIn: 'root'
})
export class BannerService {
  url = `${environment.API_URL}/v1/banner`;
  constructor(private http:HttpClient) { }

  addBanner(bannerData:Banner){
    var formData: any = new FormData();
    formData.append('title', bannerData.title);
    formData.append('image', bannerData.image);
    return this.http.post(this.url,formData);
  }
  getBannerList() {
    return this.http.get<Banner[]>(this.url);
  }
  getBannerCount() {
    return this.http.get(`${this.url}/banner-count`);
  }
  bannerPaginationList(bannerData:any){
    return this.http.post(`${this.url}/banner-pagination`,bannerData);
  }
  updateBanner(bannerData:Banner){
    return this.http.put(`${this.url}/${bannerData._id}`, bannerData);
  }
  deleteBanner(id:String){
    return this.http.delete(`${this.url}/${id}`);
  }
}

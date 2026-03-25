import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Ads } from '../modal/ads.model';
import { environment } from "src/environments/environment";
@Injectable({
  providedIn: 'root'
})
export class AdsService {
  url = `${environment.API_URL}/v1/ads`;
  constructor(private http:HttpClient) { }

  addAds(adsData:Ads){
    var formData: any = new FormData();
    formData.append('title', adsData.title);
    formData.append('image', adsData.image);
    console.log(formData)
    return this.http.post(this.url,formData);
  }
  getAdsList() {
    return this.http.get<Ads[]>(this.url);
  }
  getAdsCount() {
    return this.http.get(`${this.url}/ads-count`);
  }
  adsPaginationList(adsData:any){
    return this.http.post(`${this.url}/ads-pagination`,adsData);
  }
  updateAds(adsData:Ads){
    return this.http.put(`${this.url}/${adsData._id}`, adsData);
  }
  deleteAds(id:String){
    return this.http.delete(`${this.url}/${id}`);
  }
}

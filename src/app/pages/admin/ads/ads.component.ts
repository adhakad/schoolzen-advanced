import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { environment } from 'src/environments/environment';
import { Ads } from 'src/app/modal/ads.model';
import { AdsService } from 'src/app/services/ads.service';

@Component({
  selector: 'app-ads',
  templateUrl: './ads.component.html',
  styleUrls: ['./ads.component.css']
})
export class AdsComponent implements OnInit {
  public baseUrl = environment.API_URL;
  adsForm: FormGroup;
  showModal: boolean = false;
  updateMode: boolean = false;
  deleteMode: boolean = false;
  deleteById: String = '';
  successMsg: String = '';
  errorMsg: String = '';
  errorCheck: Boolean = false;
  adsInfo: Ads[] = [];

  recordLimit: number = 5;
  filters: any = {};
  number: number = 0;
  paginationValues: Subject<any> = new Subject();
  loader:Boolean=true;
  constructor(private fb: FormBuilder, private adsService: AdsService) {
    this.adsForm = this.fb.group({
      _id: [''],
      title: ['', Validators.required],
      image: [''],
    })
  }

  ngOnInit(): void {
    let load:any = this.getAds({ page: 1 });
    if(load){
      setTimeout(()=>{
        this.loader = false;
      },1000);
    }
  }

  getAds($event: any) {
    return new Promise((resolve, reject) => {
      let params: any = {
        filters: {},
        page: $event.page,
        limit: $event.limit ? $event.limit : this.recordLimit
      };
      this.recordLimit = params.limit;
      if (this.filters.searchText) {
        params["filters"]["searchText"] = this.filters.searchText.trim();
      }

      this.adsService.adsPaginationList(params).subscribe((res: any) => {
        if (res) {
          this.adsInfo = res.adsList;
          this.number = params.page;
          this.paginationValues.next({ type: 'page-init', page: params.page, totalTableRecords: res.countAds });
          return resolve(true);
        }
      });
    });
  }

  closeModal() {
    this.showModal = false;
    this.updateMode = false;
    this.deleteMode = false;
    this.errorMsg = '';
  }
  addAdsModel() {
    this.showModal = true;
    this.deleteMode = false;
    this.adsForm.reset();
  }
  updateAdsModel(ads: Ads) {
    this.showModal = true;
    this.deleteMode = false;
    this.updateMode = true;
    this.adsForm.patchValue(ads);
  }
  deleteAdsModel(id: String) {
    this.showModal = true;
    this.updateMode = false;
    this.deleteMode = true;
    this.deleteById = id;
  }

  successDone() {
    setTimeout(() => {
      this.closeModal();
      this.successMsg = '';
      this.getAds({ page: 1 });
    }, 1000)
  }
  adsAddUpdate() {
    if (this.adsForm.valid) {
      if (this.updateMode) {
        this.adsService.updateAds(this.adsForm.value).subscribe((res: any) => {
          if (res) {
            this.successDone();
            this.successMsg = res;
          }
        }, err => {
          this.errorCheck = true;
          this.errorMsg = err.error;
        })
      } else {
        this.adsService.addAds(this.adsForm.value).subscribe((res: any) => {
          if (res) {
            this.successDone();
            this.successMsg = res;
          }
        }, err => {
          this.errorCheck = true;
          this.errorMsg = err.error;
        })
      }
    }
  }

  adsDelete(id: String) {
    this.adsService.deleteAds(id).subscribe((res: any) => {
      if (res) {
        this.successDone();
        this.successMsg = res;
        this.deleteById = '';
      }
    })
  }

}

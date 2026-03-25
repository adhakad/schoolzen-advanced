import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from  'rxjs';
import { environment } from 'src/environments/environment';
import { Banner } from 'src/app/modal/banner.model';
import { BannerService } from 'src/app/services/banner.service';

@Component({
  selector: 'app-banner',
  templateUrl: './banner.component.html',
  styleUrls: ['./banner.component.css']
})
export class BannerComponent implements OnInit {
  public baseUrl = environment.API_URL;
  bannerForm: FormGroup;
  showModal: boolean = false;
  updateMode: boolean = false;
  deleteMode: boolean = false;
  deleteById: String = '';
  successMsg: String = '';
  errorMsg: String = '';
  errorCheck: Boolean = false;
  bannerInfo: Banner[] = [];

  recordLimit: number = 5;
  filters:any = {};
  number:number=0;
  paginationValues: Subject<any> = new Subject();
  loader:Boolean=true;
  constructor(private fb: FormBuilder, private bannerService: BannerService) {
    this.bannerForm = this.fb.group({
      _id: [''],
      title: ['', Validators.required],
      image: [''],
    })
  }

  ngOnInit(): void {
    let load:any = this.getBanner({page:1});
    if(load){
      setTimeout(()=>{
        this.loader = false;
      },1000);
    }
  }

  getBanner($event:any) {
    return new Promise((resolve, reject) => {
      let params:any = {
        filters: {},
        page: $event.page,
        limit: $event.limit ? $event.limit : this.recordLimit
      };
      this.recordLimit = params.limit;
      if(this.filters.searchText) {
        params["filters"]["searchText"] = this.filters.searchText.trim();
      }
      
      this.bannerService.bannerPaginationList(params).subscribe((res: any) => {
        if (res) {
          this.bannerInfo = res.bannerList;
          this.number = params.page;
          this.paginationValues.next({ type: 'page-init', page: params.page, totalTableRecords: res.countBanner });
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
  addBannerModel() {
    this.showModal = true;
    this.deleteMode = false;
    this.bannerForm.reset();
  }
  updateBannerModel(banner: Banner) {
    this.showModal = true;
    this.deleteMode = false;
    this.updateMode = true;
    this.bannerForm.patchValue(banner);
  }
  deleteBannerModel(id: String) {
    this.showModal = true;
    this.updateMode = false;
    this.deleteMode = true;
    this.deleteById = id;
  }

  successDone() {
    setTimeout(() => {
      this.closeModal();
      this.successMsg = '';
      this.getBanner({page:1});
    }, 1000)
  }
  bannerAddUpdate() {
    if (this.bannerForm.valid) {
      if (this.updateMode) {
        this.bannerService.updateBanner(this.bannerForm.value).subscribe((res: any) => {
          if (res) {
            this.successDone();
            this.successMsg = res;
          }
        }, err => {
          this.errorCheck = true;
          this.errorMsg = err.error;
        })
      } else {
        this.bannerService.addBanner(this.bannerForm.value).subscribe((res: any) => {
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

  bannerDelete(id: String) {
    this.bannerService.deleteBanner(id).subscribe((res: any) => {
      if (res) {
        this.successDone();
        this.successMsg = res;
        this.deleteById = '';
      }
    })
  }
}

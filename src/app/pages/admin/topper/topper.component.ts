import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { environment } from 'src/environments/environment';
import { Topper } from 'src/app/modal/topper.model';
import { Class } from 'src/app/modal/class.model';
import { TopperService } from 'src/app/services/topper.service';
import { ClassService } from 'src/app/services/class.service';

@Component({
  selector: 'app-topper',
  templateUrl: './topper.component.html',
  styleUrls: ['./topper.component.css']
})
export class TopperComponent implements OnInit {
  public baseUrl = environment.API_URL;
  topperForm: FormGroup;
  showModal: boolean = false;
  updateMode: boolean = false;
  deleteMode: boolean = false;
  deleteById: String = '';
  successMsg: String = '';
  errorMsg: String = '';
  errorCheck: Boolean = false;
  topperInfo: any[] = [];
  classInfo: any[] = [];

  recordLimit: number = 5;
  filters:any = {};
  number:number=0;
  paginationValues: Subject<any> = new Subject();
  loader:Boolean=true;
  constructor(private fb: FormBuilder, private topperService: TopperService, private classService: ClassService) {
    this.topperForm = this.fb.group({
      _id: [''],
      name: ['', Validators.required],
      class: ['', Validators.required],
      percentile: ['', Validators.required],
      year: ['', Validators.required],
      image: [''],
    })
  }

  ngOnInit(): void {
    let load:any=this.getTopper({page:1});
    this.getClass();
    if(load){
      setTimeout(()=>{
        this.loader = false;
      },1000);
    }
  }

  getClass() {
    this.classService.getClassList().subscribe((res: any[]) => {
      if (res) {
        this.classInfo = res;
      }
    })
  }

  getTopper($event:any) {
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
      
      this.topperService.topperPaginationList(params).subscribe((res: any) => {
        if (res) {
          this.topperInfo = res.topperList;
          this.number = params.page;
          this.paginationValues.next({ type: 'page-init', page: params.page, totalTableRecords: res.countTopper });
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
  addTopperModel() {
    this.showModal = true;
    this.deleteMode = false;
    this.topperForm.reset();
  }
  updateTopperModel(topper: any) {
    this.showModal = true;
    this.deleteMode = false;
    this.updateMode = true;
    this.topperForm.patchValue(topper);
  }
  deleteTopperModel(id: String) {
    this.showModal = true;
    this.updateMode = false;
    this.deleteMode = true;
    this.deleteById = id;
  }

  successDone() {
    setTimeout(() => {
      this.closeModal();
      this.successMsg = '';
      this.getTopper({page:1});
    }, 1000)
  }
  topperAddUpdate() {
    if (this.topperForm.valid) {
      if (this.updateMode) {
        this.topperService.updateTopper(this.topperForm.value).subscribe((res: any) => {
          if (res) {
            this.successDone();
            this.successMsg = res;
          }
        }, err => {
          this.errorCheck = true;
          this.errorMsg = err.error;
        })
      } else {
        this.topperService.addTopper(this.topperForm.value).subscribe((res: any) => {
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

  topperDelete(id: String) {
    this.topperService.deleteTopper(id).subscribe((res: any) => {
      if (res) {
        this.successDone();
        this.successMsg = res;
        this.deleteById = '';
      }
    })
  }

}

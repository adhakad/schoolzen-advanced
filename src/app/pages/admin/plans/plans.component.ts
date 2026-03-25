import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
// import { Plans } from 'src/app/modal/plans.model';
import { PlansService } from 'src/app/services/plans.service';

@Component({
  selector: 'app-plans',
  templateUrl: './plans.component.html',
  styleUrls: ['./plans.component.css']
})
export class PlansComponent implements OnInit {
  plansForm: FormGroup;
  showModal: boolean = false;
  updateMode: boolean = false;
  deleteMode: boolean = false;
  deleteById: String = '';
  successMsg: String = '';
  errorMsg: String = '';
  errorCheck: Boolean = false;
  plansInfo: any[] = [];

  recordLimit: number = 5;
  filters: any = {};
  number: number = 0;
  paginationValues: Subject<any> = new Subject();
  loader: Boolean = true;
  constructor(private fb: FormBuilder, private plansService: PlansService) {
    this.plansForm = this.fb.group({
      _id: [''],
      plans: ['', Validators.required],
      price: ['', Validators.required],
      withoutDiscountPrice: ['', Validators.required],
      discountPercentage: ['', Validators.required],
      teacherLimit: ['', Validators.required],
      studentLimit: ['', Validators.required],
      perStudentIncrementPrice: ['', Validators.required],
      studentIncrementRange: ['', Validators.required],
      whatsappMessagesLimit: ['', Validators.required],
    })
  }

  ngOnInit(): void {
    let load: any = this.getPlans({ page: 1 });
    if (load) {
      setTimeout(() => {
        this.loader = false;
      }, 1000);
    }
  }

  getPlans($event: any) {
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

      this.plansService.plansPaginationList(params).subscribe((res: any) => {
        if (res) {
          this.plansInfo = res.plansList;
          this.number = params.page;
          this.paginationValues.next({ type: 'page-init', page: params.page, totalTableRecords: res.countPlans });
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
  addPlansModel() {
    this.showModal = true;
    this.deleteMode = false;
    this.plansForm.reset();
  }
  updatePlansModel(plans: any) {
    this.showModal = true;
    this.deleteMode = false;
    this.updateMode = true;
    this.plansForm.patchValue(plans);
  }
  deletePlansModel(id: String) {
    this.showModal = true;
    this.updateMode = false;
    this.deleteMode = true;
    this.deleteById = id;
  }

  successDone() {
    setTimeout(() => {
      this.closeModal();
      this.successMsg = '';
      this.getPlans({ page: 1 });
    }, 1000)
  }
  plansAddUpdate() {
    if (this.plansForm.valid) {
      if (this.updateMode) {
        this.plansService.updatePlans(this.plansForm.value).subscribe((res: any) => {
          if (res) {
            this.successDone();
            this.successMsg = res;
          }
        }, err => {
          this.errorCheck = true;
          this.errorMsg = err.error;
        })
      } else {
        this.plansService.addPlans(this.plansForm.value).subscribe((res: any) => {
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

  plansDelete(id: String) {
    this.plansService.deletePlans(id).subscribe((res: any) => {
      if (res) {
        this.successDone();
        this.successMsg = res;
        this.deleteById = '';
      }
    })
  }

}

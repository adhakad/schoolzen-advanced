import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { DepartmentService } from 'src/app/services/department.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-department',
  templateUrl: './department.component.html',
  styleUrls: ['./department.component.css']
})
export class DepartmentComponent implements OnInit {
  departmentForm: FormGroup;
  showModal: boolean = false;
  updateMode: boolean = false;
  deleteMode: boolean = false;
  deleteById: String = '';
  successMsg: String = '';
  errorMsg: String = '';
  errorCheck: Boolean = false;
  departmentInfo: any[] = [];

  recordLimit: number = 5;
  filters: any = {};
  number: number = 0;
  paginationValues: Subject<any> = new Subject();
  loader: Boolean = true;
  adminId!: string;

  // Double-submit guard
  isClick: boolean = false;

  constructor(private fb: FormBuilder, private toastr: ToastrService, private adminAuthService: AdminAuthService, private departmentService: DepartmentService) {
    this.departmentForm = this.fb.group({
      _id: [''],
      adminId: [''],
      name: ['', Validators.required],
      status: ['active'],
    })
  }

  ngOnInit(): void {
    let getAdmin = this.adminAuthService.getLoggedInAdminInfo();
    this.adminId = getAdmin?.id;
    let load: any = this.getDepartment({ page: 1 });
    if (load) {
      setTimeout(() => {
        this.loader = false;
      }, 1000);
    }
  }

  getDepartment($event: any) {
    return new Promise((resolve, reject) => {
      let params: any = {
        filters: {},
        page: $event.page,
        limit: $event.limit ? $event.limit : this.recordLimit,
        adminId: this.adminId,
      };
      this.recordLimit = params.limit;
      if (this.filters.searchText) {
        params["filters"]["searchText"] = this.filters.searchText.trim();
      }

      this.departmentService.departmentPaginationList(params).subscribe((res: any) => {
        if (res) {
          this.departmentInfo = res.departmentList;
          this.number = params.page;
          this.paginationValues.next({ type: 'page-init', page: params.page, totalTableRecords: res.countDepartment });
          return resolve(true);
        }
      });
    });
  }

  closeModal() {
    this.showModal = false;
    this.updateMode = false;
    this.deleteMode = false;
    this.errorCheck = false;
    this.errorMsg = '';
  }
  addDepartmentModel() {
    this.showModal = true;
    this.deleteMode = false;
    this.errorCheck = false;
    this.errorMsg = '';
    this.isClick = false;
    this.departmentForm.reset({ status: 'active' });
  }
  updateDepartmentModel(department: any) {
    this.showModal = true;
    this.deleteMode = false;
    this.updateMode = true;
    this.errorCheck = false;
    this.errorMsg = '';
    this.isClick = false;
    this.departmentForm.patchValue(department);
  }
  deleteDepartmentModel(id: String) {
    this.showModal = true;
    this.updateMode = false;
    this.deleteMode = true;
    this.deleteById = id;
    this.errorCheck = false;
    this.errorMsg = '';
    this.isClick = false;
  }

  successDone(res: any) {
    this.closeModal();
    this.successMsg = '';
    this.getDepartment({ page: 1 });
    setTimeout(() => {
      this.toastr.success('', res);
    }, 500)
  }

  departmentAddUpdate() {
    if (this.departmentForm.valid) {
      if (this.isClick) {
        return;
      }
      this.errorCheck = false;
      this.errorMsg = '';
      this.isClick = true;
      this.departmentForm.value.adminId = this.adminId;
      if (this.updateMode) {
        this.departmentService.updateDepartment(this.departmentForm.value).subscribe((res: any) => {
          if (res) {
            this.isClick = false;
            this.successDone(res);
          }
        }, err => {
          this.errorCheck = true;
          this.errorMsg = err.error;
          this.isClick = false;
        })
      } else {
        this.departmentService.addDepartment(this.departmentForm.value).subscribe((res: any) => {
          if (res) {
            this.isClick = false;
            this.successDone(res);
          }
        }, err => {
          this.errorCheck = true;
          this.errorMsg = err.error;
          this.isClick = false;
        })
      }
    }
  }

  departmentDelete(id: String) {
    if (this.isClick) {
      return;
    }
    this.isClick = true;
    this.departmentService.deleteDepartment(id).subscribe((res: any) => {
      if (res) {
        this.isClick = false;
        this.successDone(res);
        this.deleteById = '';
      }
    }, err => {
      this.errorCheck = true;
      this.errorMsg = err.error;
      this.isClick = false;
    })
  }
}

import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { DesignationService } from 'src/app/services/designation.service';
import { DepartmentService } from 'src/app/services/department.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-designation',
  templateUrl: './designation.component.html',
  styleUrls: ['./designation.component.css']
})
export class DesignationComponent implements OnInit {
  designationForm: FormGroup;
  showModal: boolean = false;
  updateMode: boolean = false;
  deleteMode: boolean = false;
  deleteById: String = '';
  successMsg: String = '';
  errorMsg: String = '';
  errorCheck: Boolean = false;
  designationInfo: any[] = [];
  departmentInfo: any[] = [];

  recordLimit: number = 5;
  filters: any = {};
  number: number = 0;
  paginationValues: Subject<any> = new Subject();
  loader: Boolean = true;
  adminId!: string;

  // Double-submit guard
  isClick: boolean = false;

  constructor(private fb: FormBuilder, private toastr: ToastrService, private adminAuthService: AdminAuthService, private designationService: DesignationService, private departmentService: DepartmentService) {
    this.designationForm = this.fb.group({
      _id: [''],
      adminId: [''],
      title: ['', Validators.required],
      departmentId: [''],
      status: ['active'],
    })
  }

  ngOnInit(): void {
    let getAdmin = this.adminAuthService.getLoggedInAdminInfo();
    this.adminId = getAdmin?.id;
    let load: any = this.getDesignation({ page: 1 });
    if (load) {
      setTimeout(() => {
        this.loader = false;
      }, 1000);
    }
    this.getDepartmentList();
  }

  getDepartmentList() {
    this.departmentService.getDepartmentList(this.adminId).subscribe((res: any) => {
      if (res) {
        this.departmentInfo = res;
      }
    })
  }

  getDepartmentName(id: String) {
    let department = this.departmentInfo.find((d: any) => d._id === id);
    return department ? department.name : '—';
  }

  getDesignation($event: any) {
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

      this.designationService.designationPaginationList(params).subscribe((res: any) => {
        if (res) {
          this.designationInfo = res.designationList;
          this.number = params.page;
          this.paginationValues.next({ type: 'page-init', page: params.page, totalTableRecords: res.countDesignation });
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
  addDesignationModel() {
    this.showModal = true;
    this.deleteMode = false;
    this.errorCheck = false;
    this.errorMsg = '';
    this.isClick = false;
    this.designationForm.reset({ status: 'active' });
  }
  updateDesignationModel(designation: any) {
    this.showModal = true;
    this.deleteMode = false;
    this.updateMode = true;
    this.errorCheck = false;
    this.errorMsg = '';
    this.isClick = false;
    this.designationForm.patchValue(designation);
  }
  deleteDesignationModel(id: String) {
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
    this.getDesignation({ page: 1 });
    setTimeout(() => {
      this.toastr.success('', res);
    }, 500)
  }

  designationAddUpdate() {
    if (this.designationForm.valid) {
      if (this.isClick) {
        return;
      }
      this.errorCheck = false;
      this.errorMsg = '';
      this.isClick = true;
      this.designationForm.value.adminId = this.adminId;
      if (this.updateMode) {
        this.designationService.updateDesignation(this.designationForm.value).subscribe((res: any) => {
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
        this.designationService.addDesignation(this.designationForm.value).subscribe((res: any) => {
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

  designationDelete(id: String) {
    if (this.isClick) {
      return;
    }
    this.isClick = true;
    this.designationService.deleteDesignation(id).subscribe((res: any) => {
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

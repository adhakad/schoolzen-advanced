import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { LeaveTypeService } from 'src/app/services/leave-type.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-leave-type',
  templateUrl: './leave-type.component.html',
  styleUrls: ['./leave-type.component.css']
})
export class LeaveTypeComponent implements OnInit {
  leaveTypeForm: FormGroup;
  showModal: boolean = false;
  updateMode: boolean = false;
  deleteMode: boolean = false;
  deleteById: String = '';
  successMsg: String = '';
  errorMsg: String = '';
  errorCheck: Boolean = false;
  leaveTypeInfo: any[] = [];

  recordLimit: number = 5;
  filters: any = {};
  number: number = 0;
  paginationValues: Subject<any> = new Subject();
  loader: Boolean = true;
  adminId!: string;

  // Double-submit guard
  isClick: boolean = false;

  constructor(private fb: FormBuilder, private toastr: ToastrService, private adminAuthService: AdminAuthService, private leaveTypeService: LeaveTypeService) {
    this.leaveTypeForm = this.fb.group({
      _id: [''],
      adminId: [''],
      name: ['', Validators.required],
      // No default cap, on the same reasoning as the Shift form: a pre-filled 12 is a
      // policy nobody chose, and it would only be noticed when somebody is refused leave
      // they should have had.
      maxDaysPerYear: [null, [Validators.required, Validators.min(1)]],
      applicableTo: ['all'],
      // Lifecycle flags, not policy — these two may safely start somewhere.
      isPaid: [false],
      status: ['active'],
    })
  }

  ngOnInit(): void {
    let getAdmin = this.adminAuthService.getLoggedInAdminInfo();
    this.adminId = getAdmin?.id;
    let load: any = this.getLeaveType({ page: 1 });
    if (load) {
      setTimeout(() => {
        this.loader = false;
      }, 1000);
    }
  }

  getLeaveType($event: any) {
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

      this.leaveTypeService.leaveTypePaginationList(params).subscribe((res: any) => {
        if (res) {
          this.leaveTypeInfo = res.leaveTypeList;
          this.number = params.page;
          this.paginationValues.next({ type: 'page-init', page: params.page, totalTableRecords: res.countLeaveType });
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
  addLeaveTypeModel() {
    this.showModal = true;
    this.deleteMode = false;
    this.updateMode = false;
    this.errorCheck = false;
    this.errorMsg = '';
    this.isClick = false;
    this.leaveTypeForm.reset({ applicableTo: 'all', isPaid: false, status: 'active' });
  }
  updateLeaveTypeModel(leaveType: any) {
    this.showModal = true;
    this.deleteMode = false;
    this.updateMode = true;
    this.errorCheck = false;
    this.errorMsg = '';
    this.isClick = false;
    this.leaveTypeForm.patchValue(leaveType);
  }
  deleteLeaveTypeModel(id: String) {
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
    this.getLeaveType({ page: 1 });
    setTimeout(() => {
      this.toastr.success('', res);
    }, 500)
  }

  leaveTypeAddUpdate() {
    if (this.leaveTypeForm.valid) {
      if (this.isClick) {
        return;
      }
      this.errorCheck = false;
      this.errorMsg = '';
      this.isClick = true;
      this.leaveTypeForm.value.adminId = this.adminId;
      if (this.updateMode) {
        this.leaveTypeService.updateLeaveType(this.leaveTypeForm.value).subscribe((res: any) => {
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
        this.leaveTypeService.addLeaveType(this.leaveTypeForm.value).subscribe((res: any) => {
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

  leaveTypeDelete(id: String) {
    if (this.isClick) {
      return;
    }
    this.isClick = true;
    this.leaveTypeService.deleteLeaveType(id).subscribe((res: any) => {
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

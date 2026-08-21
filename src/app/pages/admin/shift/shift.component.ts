import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ShiftService } from 'src/app/services/shift.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-shift',
  templateUrl: './shift.component.html',
  styleUrls: ['./shift.component.css']
})
export class ShiftComponent implements OnInit {
  shiftForm: FormGroup;
  showModal: boolean = false;
  updateMode: boolean = false;
  deleteMode: boolean = false;
  deleteById: String = '';
  successMsg: String = '';
  errorMsg: String = '';
  errorCheck: Boolean = false;
  shiftInfo: any[] = [];

  recordLimit: number = 5;
  filters: any = {};
  number: number = 0;
  paginationValues: Subject<any> = new Subject();
  loader: Boolean = true;
  adminId!: string;

  // Double-submit guard
  isClick: boolean = false;

  constructor(private fb: FormBuilder, private toastr: ToastrService, private adminAuthService: AdminAuthService, private shiftService: ShiftService) {
    // NO DEFAULTS on any timing field, deliberately — see the same note on models/shift.js.
    // A pre-filled 09:00/30/10/120 is how a school ends up running its whole attendance on
    // numbers nobody chose. Every field starts empty and must be filled by hand; `status` is
    // the one exception because it is a lifecycle flag, not a timing rule.
    this.shiftForm = this.fb.group({
      _id: [''],
      adminId: [''],
      name: ['', Validators.required],
      startTime: ['', Validators.required],
      endTime: ['', Validators.required],
      // Punch-in settings
      earlyPunchMinutes: [null, [Validators.required, Validators.min(0)]],
      graceMinutes: [null, [Validators.required, Validators.min(0)]],
      // Staff/teacher only — never read when the person is a student.
      halfDayAfterMinutes: [null, [Validators.required, Validators.min(0)]],
      earlyCheckoutMinutes: [null, [Validators.required, Validators.min(0)]],
      lateCheckoutMinutes: [null, [Validators.required, Validators.min(0)]],
      status: ['active'],
    })
  }

  ngOnInit(): void {
    let getAdmin = this.adminAuthService.getLoggedInAdminInfo();
    this.adminId = getAdmin?.id;
    let load: any = this.getShift({ page: 1 });
    if (load) {
      setTimeout(() => {
        this.loader = false;
      }, 1000);
    }
  }

  getShift($event: any) {
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

      this.shiftService.shiftPaginationList(params).subscribe((res: any) => {
        if (res) {
          this.shiftInfo = res.shiftList;
          this.number = params.page;
          this.paginationValues.next({ type: 'page-init', page: params.page, totalTableRecords: res.countShift });
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
  addShiftModel() {
    this.showModal = true;
    this.deleteMode = false;
    this.updateMode = false;
    this.errorCheck = false;
    this.errorMsg = '';
    this.isClick = false;
    // Everything blank except status — nothing is seeded, so the school owner has to make
    // every timing decision explicitly.
    this.shiftForm.reset({ status: 'active' });
  }
  updateShiftModel(shift: any) {
    this.showModal = true;
    this.deleteMode = false;
    this.updateMode = true;
    this.errorCheck = false;
    this.errorMsg = '';
    this.isClick = false;
    this.shiftForm.patchValue(shift);
  }
  deleteShiftModel(id: String) {
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
    this.getShift({ page: 1 });
    setTimeout(() => {
      this.toastr.success('', res);
    }, 500)
  }

  shiftAddUpdate() {
    if (this.shiftForm.valid) {
      if (this.isClick) {
        return;
      }
      this.errorCheck = false;
      this.errorMsg = '';
      this.isClick = true;
      this.shiftForm.value.adminId = this.adminId;
      if (this.updateMode) {
        this.shiftService.updateShift(this.shiftForm.value).subscribe((res: any) => {
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
        this.shiftService.addShift(this.shiftForm.value).subscribe((res: any) => {
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

  shiftDelete(id: String) {
    if (this.isClick) {
      return;
    }
    this.isClick = true;
    this.shiftService.deleteShift(id).subscribe((res: any) => {
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

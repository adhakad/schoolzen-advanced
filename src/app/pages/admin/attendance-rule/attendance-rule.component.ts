import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { AttendanceRuleService } from 'src/app/services/attendance-rule.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-attendance-rule',
  templateUrl: './attendance-rule.component.html',
  styleUrls: ['./attendance-rule.component.css']
})
export class AttendanceRuleComponent implements OnInit {
  attendanceRuleForm: FormGroup;
  updateMode: boolean = false;
  errorCheck: Boolean = false;
  errorMsg: String = '';
  loader: Boolean = true;
  adminId!: string;

  // Double-submit guard
  isClick: boolean = false;

  constructor(private fb: FormBuilder, private toastr: ToastrService, private adminAuthService: AdminAuthService, private attendanceRuleService: AttendanceRuleService) {
    this.attendanceRuleForm = this.fb.group({
      _id: [''],
      adminId: [''],
      workStart: ['09:00', Validators.required],
      lateAfter: [15, [Validators.required, Validators.min(0)]],
      halfDayAfter: [120, [Validators.required, Validators.min(0)]],
      allowOvertime: [false],
    })
  }

  ngOnInit(): void {
    let getAdmin = this.adminAuthService.getLoggedInAdminInfo();
    this.adminId = getAdmin?.id;
    this.getAttendanceRule();
    setTimeout(() => {
      this.loader = false;
    }, 1000);
  }

  getAttendanceRule() {
    this.attendanceRuleService.getAttendanceRule(this.adminId).subscribe((res: any) => {
      if (res) {
        this.updateMode = true;
        this.attendanceRuleForm.patchValue(res);
      }
    }, err => {
      // No attendance rule configured yet for this school — normal first-time state,
      // keep the form at its defaults and let the user create one.
      if (err.status === 404) {
        this.updateMode = false;
      } else {
        this.errorCheck = true;
        this.errorMsg = err.error;
      }
    })
  }

  attendanceRuleSubmit() {
    if (this.attendanceRuleForm.valid) {
      if (this.isClick) {
        return;
      }
      this.errorCheck = false;
      this.errorMsg = '';
      this.isClick = true;
      this.attendanceRuleForm.value.adminId = this.adminId;
      if (this.updateMode) {
        this.attendanceRuleService.updateAttendanceRule(this.attendanceRuleForm.value).subscribe((res: any) => {
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
        this.attendanceRuleService.addAttendanceRule(this.attendanceRuleForm.value).subscribe((res: any) => {
          if (res) {
            this.isClick = false;
            this.updateMode = true;
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

  successDone(res: any) {
    this.errorCheck = false;
    this.errorMsg = '';
    this.getAttendanceRule();
    setTimeout(() => {
      this.toastr.success('', res);
    }, 500)
  }
}

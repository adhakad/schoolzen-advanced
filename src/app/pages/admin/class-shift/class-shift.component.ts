import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ClassShiftService } from 'src/app/services/class-shift.service';
import { ShiftService } from 'src/app/services/shift.service';

@Component({
  selector: 'app-class-shift',
  templateUrl: './class-shift.component.html',
  styleUrls: ['./class-shift.component.css']
})
export class ClassShiftComponent implements OnInit {

  classShiftForm: FormGroup;

  shiftInfo: any[] = [];
  classOptions: String[] = [];
  classShiftInfo: any[] = [];
  // Ticked classes in the assign form. Plain array rather than a form control because the
  // checklist is rendered as loose mat-checkboxes, matching class-subject.component.ts.
  selectedClasses: String[] = [];

  errorMsg: String = '';
  errorCheck: Boolean = false;
  loader: Boolean = true;
  adminId!: string;

  // Double-submit guard
  isClick: boolean = false;

  // Delete confirmation modal
  showModal: boolean = false;
  deleteById: String = '';

  constructor(
    private fb: FormBuilder,
    private toastr: ToastrService,
    private adminAuthService: AdminAuthService,
    private classShiftService: ClassShiftService,
    private shiftService: ShiftService,
  ) {
    this.classShiftForm = this.fb.group({
      shiftId: ['', Validators.required],
    });
  }

  ngOnInit(): void {
    this.adminId = this.adminAuthService.getLoggedInAdminInfo()?.id;
    this.getShiftList();
    this.getClassOptions();
    this.getClassShiftList();
  }

  getShiftList(): void {
    this.shiftService.getShiftList(this.adminId).subscribe((res: any) => {
      // Only an active shift is assignable — pointing a class at an inactive one would
      // resolve to a baseline the school has deliberately retired.
      if (res) this.shiftInfo = res.filter((shift: any) => shift.status === 'active');
    });
  }

  getClassOptions(): void {
    this.classShiftService.getClassOptions(this.adminId).subscribe(
      (res: any) => { this.classOptions = res || []; },
      () => { this.classOptions = []; }
    );
  }

  getClassShiftList(): void {
    this.classShiftService.getClassShiftList(this.adminId).subscribe(
      (res: any) => { this.classShiftInfo = res || []; this.loader = false; },
      (err: any) => { this.errorCheck = true; this.errorMsg = err.error; this.loader = false; }
    );
  }

  // --- Class checklist ---

  toggleClass(classKey: String): void {
    const index = this.selectedClasses.indexOf(classKey);
    if (index > -1) {
      this.selectedClasses.splice(index, 1);
    } else {
      this.selectedClasses.push(classKey);
    }
  }

  selectAllClasses(): void {
    // Toggle: a second click clears, so the button doubles as "none".
    this.selectedClasses = this.selectedClasses.length === this.classOptions.length
      ? []
      : [...this.classOptions];
  }

  // The classSuffix pipe is typed for a number and compares numerically ("1st", "Nursery"
  // for the 200/201/202 sentinels). Class keys travel as strings here to match the
  // ClassShift model, so coerce at the render boundary rather than widening a shared pipe.
  classNumber(classKey: any): number {
    return Number(classKey);
  }

  // The shift a class is currently on, shown inline in the checklist so the consequence of
  // ticking it is visible before submitting.
  // Returns a primitive `string`, not the `String` wrapper the models use — the titlecase
  // pipe only accepts the primitive.
  currentShiftName(classKey: String): string {
    const row = this.classShiftInfo.find((item: any) => String(item.class) === String(classKey));
    return row ? String(row.shiftName) : '';
  }

  // --- Assign ---

  successDone(msg: any): void {
    this.selectedClasses = [];
    this.classShiftForm.reset({ shiftId: '' });
    this.errorCheck = false;
    this.errorMsg = '';
    this.getClassShiftList();
    setTimeout(() => {
      this.toastr.success('', msg);
    }, 500);
  }

  classShiftAssign(): void {
    if (!this.classShiftForm.valid || this.selectedClasses.length === 0) return;
    if (this.isClick) {
      return;
    }
    this.errorCheck = false;
    this.errorMsg = '';
    this.isClick = true;

    this.classShiftService.bulkAssignClassShift({
      adminId: this.adminId,
      shiftId: this.classShiftForm.value.shiftId,
      classes: this.selectedClasses,
    }).subscribe((res: any) => {
      if (res) {
        this.isClick = false;
        this.successDone(res);
      }
    }, err => {
      this.errorCheck = true;
      this.errorMsg = err.error;
      this.isClick = false;
    });
  }

  // --- Remove ---

  deleteClassShiftModel(id: String): void {
    this.showModal = true;
    this.deleteById = id;
    this.errorCheck = false;
    this.errorMsg = '';
    this.isClick = false;
  }

  closeModal(): void {
    this.showModal = false;
    this.deleteById = '';
    this.errorCheck = false;
    this.errorMsg = '';
  }

  classShiftDelete(id: String): void {
    if (this.isClick) {
      return;
    }
    this.isClick = true;
    this.classShiftService.deleteClassShift(id).subscribe((res: any) => {
      if (res) {
        this.isClick = false;
        this.closeModal();
        this.successDone(res);
      }
    }, err => {
      this.errorCheck = true;
      this.errorMsg = err.error;
      this.isClick = false;
    });
  }
}

import { Component, ElementRef, ViewChild, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { ClassService } from 'src/app/services/class.service';
import { ReminderService } from 'src/app/services/reminder.service';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { environment } from 'src/environments/environment';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-admin-fees-reminder',
  templateUrl: './admin-fees-reminder.component.html',
  styleUrls: ['./admin-fees-reminder.component.css']
})
export class AdminFeesReminderComponent implements OnInit {
  public baseUrl = environment.API_URL;
  studentFilterForm: FormGroup;
  feeReminderSendForm: FormGroup;
  feeReminderLaterSendForm: FormGroup;
  showModal: boolean = false;
  showReminderFilterDeleteModal: boolean = false;
  deleteById: String = '';
  classInfo: any[] = [];
  cls: number = 0;
  filterStatus: boolean = false;
  studentFilterData: any[] = [];
  filterStudentCount: number = 0;
  selectedIds: string[] = [];
  isAllSelected = false;
  sendLaterChecked: boolean = false;
  allFilters: any;
  reminderFilterList: any[] = [];
  hideButton: boolean = false;
  baseURL!: string;
  loader: Boolean = true;
  adminId!: String

  // Add submission state management properties
  isFilterClick: boolean = false;     // For student filter button
  isSendNowClick: boolean = false;    // For send now button
  isSaveFiltersClick: boolean = false; // For save filters button
  isDeleteClick: boolean = false;     // For delete button

  constructor(private router: Router, public activatedRoute: ActivatedRoute, private fb: FormBuilder, private toastr: ToastrService, private adminAuthService: AdminAuthService, private classService: ClassService, private reminderService: ReminderService) {
    this.studentFilterForm = this.fb.group({
      _id: [''],
      adminId: [''],
      class: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
      paymentLastDate: ['', [Validators.required]],
      minPercentage: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
      lastPaymentDays: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
      lastReminderDays: ['', [Validators.required, Validators.pattern(/^\d+$/)]]
    })
    this.feeReminderSendForm = this.fb.group({
      _id: [''],
      adminId: [''],
      paymentLastDate: [''],
      students: this.fb.array<FormGroup>([])
    })
    this.feeReminderLaterSendForm = this.fb.group({
      _id: [''],
      adminId: [''],
      class: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
      minPercentage: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
      lastPaymentDays: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
      lastReminderDays: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
      paymentLastDate: [''],
    })
  }

  ngOnInit(): void {
    let getAdmin = this.adminAuthService.getLoggedInAdminInfo();
    this.adminId = getAdmin?.id;
    this.getClass();
    this.activatedRoute.queryParams.subscribe((params) => {
      this.cls = +params['cls'] || 0;
      if (this.cls) {
        this.getAllReminderFilterByClass();
      } else {
        this.cls = 0;
        this.reminderFilterList = [];
      }
    });
    var currentURL = window.location.href;
    this.baseURL = new URL(currentURL).origin;
  }

  chooseClass(cls: number) {
    this.cls = cls;
    this.reminderFilterList = [];
    this.updateRouteParams();
    this.getAllReminderFilterByClass();
  }

  updateRouteParams() {
    this.router.navigate([], {
      relativeTo: this.activatedRoute,
      queryParams: { cls: this.cls || null }, // Reset parameters if cls or stream is null
      queryParamsHandling: 'merge' // Keep other query params
    });
  }

  closeModal() {
    this.showModal = false;
    this.showReminderFilterDeleteModal = false;
    // Forms ko reset karo
    this.studentFilterForm.reset();
    this.feeReminderSendForm.setControl('students', this.fb.array([]));
    this.feeReminderLaterSendForm.reset();
    // State ko reset karo
    this.selectedIds = [];
    this.isAllSelected = false;
    this.sendLaterChecked = false;
    this.filterStatus = false;
    this.hideButton = false;
    this.filterStudentCount = 0;
    this.allFilters = null;

    // Reset all submission states
    this.isFilterClick = false;
    this.isSendNowClick = false;
    this.isSaveFiltersClick = false;
    this.isDeleteClick = false;
  }

  addStudentModel() {
    this.showModal = true;
    this.studentFilterForm.reset();
    // Reset submission states when opening modal
    this.isFilterClick = false;
    this.isSendNowClick = false;
    this.isSaveFiltersClick = false;
  }

  deleteReminderFilterModel(id: String) {
    this.showReminderFilterDeleteModal = true;
    this.deleteById = id;
    this.isDeleteClick = false; // Reset delete state
  }

  getClass() {
    this.classService.getClassList().subscribe((res: any) => {
      if (res) {
        this.classInfo = res.map((item: any) => item.class);
      }
    })
  }

  successDone(msg: any) {
    this.closeModal();
    this.getAllReminderFilterByClass();
    setTimeout(() => {
      this.toastr.success('', msg);
    }, 500)
  }

  getAllReminderFilterByClass() {
    let params = {
      class: this.cls,
      adminId: this.adminId,
    }
    this.reminderService.getAllReminderFilterByClass(params).subscribe((res: any) => {
      if (res) {
        this.reminderFilterList = res.reminderFilterList;
      }
    })
  }

  date(e: any) {
    var convertDate = new Date(e.target.value).toISOString().substring(0, 10);
    this.studentFilterForm.get('paymentLastDate')?.setValue(convertDate, {
      onlyself: true,
    });
  }

  get studentsArray(): FormArray {
    return this.feeReminderSendForm.get('students') as FormArray;
  }

  toggleSendLater(checked: boolean) {
    this.sendLaterChecked = checked;
    const arr = this.fb.array<FormGroup>([]);
    if (checked) {
      // Checkbox checked → deselect all students
      this.selectedIds = [];
    } else {
      // Checkbox unchecked → select all students
      this.selectedIds = this.studentFilterData.map(s => s.studentId);
      this.studentFilterData.forEach(s => {
        arr.push(this.fb.group({ studentId: [s.studentId] }));
      });
    }
    this.feeReminderSendForm.setControl('students', arr);
    this.isAllSelected = this.selectedIds.length === this.studentFilterData.length;
  }

  toggleAllSelection(checked: boolean) {
    this.isAllSelected = checked;
    this.selectedIds = [];
    const arr = this.fb.array<FormGroup>([]);
    if (checked) {
      this.studentFilterData.forEach(s => {
        this.selectedIds.push(s.studentId);
        arr.push(this.fb.group({ studentId: [s.studentId] }));
      });
    }
    this.feeReminderSendForm.setControl('students', arr);
    this.sendLaterChecked = false; // reset send later checkbox
  }

  toggleSelection(studentId: string, checked: boolean) {
    if (checked) {
      if (!this.selectedIds.includes(studentId)) {
        this.selectedIds.push(studentId);
        this.studentsArray.push(this.fb.group({ studentId: [studentId] }));
      }
    } else {
      this.selectedIds = this.selectedIds.filter(id => id !== studentId);
      const index = this.studentsArray.value.findIndex(
        (s: any) => s.studentId === studentId
      );
      if (index > -1) {
        this.studentsArray.removeAt(index);
      }
    }
    this.isAllSelected = this.selectedIds.length === this.studentFilterData.length;
    this.sendLaterChecked = false; // reset send later checkbox
  }

  studentFilter() {
    // Check if form is valid and not already submitting
    if (!this.studentFilterForm.valid || this.isFilterClick) {
      return;
    }

    this.isFilterClick = true; // Set loading state
    this.studentFilterForm.patchValue({ adminId: this.adminId });

    this.reminderService.studentFilter(this.studentFilterForm.value).subscribe(
      (res: any) => {
        if (res) {
          this.studentFilterData = res.studentFilterData;
          this.filterStudentCount = res.filterStudentCount;
          this.filterStatus = res.filterStatus;
          this.allFilters = res.allFilters;
          const arr = this.fb.array<FormGroup>([]);
          this.selectedIds = this.studentFilterData.map(s => s.studentId);
          this.selectedIds.forEach(id =>
            arr.push(
              this.fb.group({
                studentId: [id]
              })
            )
          );
          this.feeReminderSendForm.patchValue({ paymentLastDate: res.allFilters.paymentLastDate });
          this.feeReminderSendForm.setControl('students', arr);
          this.isAllSelected = true;
        }
        this.isFilterClick = false; // Reset loading state
      }, 
      err => {
        this.toastr.error('', err.error.errorMsg);
        this.isFilterClick = false; // Reset loading state on error
      }
    );
  }

  studentFilterBySavedFilter(reminderFilter: any) {
    // Check if not already processing
    if (this.isFilterClick) {
      return;
    }

    this.isFilterClick = true; // Set loading state
    this.studentFilterForm.patchValue({ adminId: this.adminId });
    this.studentFilterForm.patchValue({ class: reminderFilter.class });
    this.studentFilterForm.patchValue({ minPercentage: reminderFilter.minPercentage });
    this.studentFilterForm.patchValue({ lastPaymentDays: reminderFilter.lastPaymentDays });
    this.studentFilterForm.patchValue({ lastReminderDays: reminderFilter.lastReminderDays });
    this.studentFilterForm.patchValue({ paymentLastDate: reminderFilter.paymentLastDate });
    
    this.reminderService.studentFilter(this.studentFilterForm.value).subscribe(
      (res: any) => {
        if (res) {
          this.hideButton = true;
          this.studentFilterData = res.studentFilterData;
          this.filterStudentCount = res.filterStudentCount;
          this.filterStatus = res.filterStatus;
          this.allFilters = res.allFilters;
          const arr = this.fb.array<FormGroup>([]);
          this.selectedIds = this.studentFilterData.map(s => s.studentId);
          this.selectedIds.forEach(id =>
            arr.push(
              this.fb.group({
                studentId: [id]
              })
            )
          );
          this.feeReminderSendForm.patchValue({ paymentLastDate: res.allFilters.paymentLastDate });
          this.feeReminderSendForm.setControl('students', arr);
          this.isAllSelected = true;
          this.showModal = true;
        }
        this.isFilterClick = false; // Reset loading state
      }, 
      err => {
        this.toastr.error('', err.error.errorMsg);
        this.isFilterClick = false; // Reset loading state on error
      }
    );
  }

  feeReminderSend() {
    // Check if not already sending and has selected students
    if (this.isSendNowClick || !this.selectedIds.length) {
      return;
    }

    this.isSendNowClick = true; // Set loading state
    this.feeReminderSendForm.value.adminId = this.adminId;
    
    this.reminderService.sendFeesReminder(this.feeReminderSendForm.value).subscribe(
      (res: any) => {
        if (res) {
          this.isSendNowClick = false; // Reset loading state
          this.successDone(res.message);
        }
      }, 
      err => {
        this.toastr.error('', err.error.errorMsg);
        this.isSendNowClick = false; // Reset loading state on error
      }
    );
  }

  feeReminderLaterSend() {
    // Check if not already saving and send later is checked
    if (this.isSaveFiltersClick || !this.sendLaterChecked) {
      return;
    }

    this.isSaveFiltersClick = true; // Set loading state
    this.feeReminderLaterSendForm.value.adminId = this.adminId;
    this.feeReminderLaterSendForm.value.class = this.allFilters.className;
    this.feeReminderLaterSendForm.value.minPercentage = this.allFilters.minPercentage;
    this.feeReminderLaterSendForm.value.lastPaymentDays = this.allFilters.lastPaymentDays;
    this.feeReminderLaterSendForm.value.lastReminderDays = this.allFilters.lastReminderDays;
    this.feeReminderLaterSendForm.value.paymentLastDate = this.allFilters.paymentLastDate;
    
    this.reminderService.addFeesReminderFilter(this.feeReminderLaterSendForm.value).subscribe(
      (res: any) => {
        if (res) {
          this.isSaveFiltersClick = false; // Reset loading state
          this.successDone(res.message);
          this.getAllReminderFilterByClass();
        }
      }, 
      err => {
        this.toastr.error('', err.error.errorMsg);
        this.isSaveFiltersClick = false; // Reset loading state on error
      }
    );
  }

  reminderFilterDelete(id: String) {
    // Check if not already deleting
    if (this.isDeleteClick) {
      return;
    }

    this.isDeleteClick = true; // Set loading state
    
    this.reminderService.deleteReminderFilter(id).subscribe((res: any) => {
      if (res) {
        this.isDeleteClick = false; // Reset loading state
        this.showReminderFilterDeleteModal = false;
        this.successDone(res.message);
      }
    }, 
    err => {
      this.toastr.error('', err.error.errorMsg);
      this.isDeleteClick = false; // Reset loading state on error
    });
  }
}
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { StaffService } from 'src/app/services/staff.service';
import { DepartmentService } from 'src/app/services/department.service';
import { DesignationService } from 'src/app/services/designation.service';
import { BiometricMappingService } from 'src/app/services/biometric-mapping.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-staff',
  templateUrl: './staff.component.html',
  styleUrls: ['./staff.component.css']
})
export class StaffComponent implements OnInit {
  staffForm: FormGroup;
  showModal: boolean = false;
  updateMode: boolean = false;
  deleteMode: boolean = false;
  deleteById: String = '';
  successMsg: String = '';
  errorMsg: String = '';
  errorCheck: Boolean = false;
  staffInfo: any[] = [];
  departmentInfo: any[] = [];
  designationInfo: any[] = [];
  filteredDesignationInfo: any[] = [];

  recordLimit: number = 5;
  filters: any = {};
  number: number = 0;
  paginationValues: Subject<any> = new Subject();
  loader: Boolean = true;
  adminId!: string;

  // Double-submit guard
  isClick: boolean = false;

  // Assign Card modal state
  showAssignCardModal: boolean = false;
  assignCardForm: FormGroup;
  assignCardPerson: any = null;
  assignCardIsClick: boolean = false;
  assignCardErrorCheck: boolean = false;
  assignCardErrorMsg: string = '';

  // Bulk Assign Card (CSV) modal state
  showBulkAssignCardModal: boolean = false;
  bulkAssignCardFile: File | null = null;
  bulkAssignCardIsClick: boolean = false;
  bulkAssignCardErrorMsg: string = '';
  bulkAssignCardResult: { successCount: number, failedCount: number, failed: any[] } | null = null;

  constructor(private fb: FormBuilder, private toastr: ToastrService, private adminAuthService: AdminAuthService, private staffService: StaffService, private departmentService: DepartmentService, private designationService: DesignationService, private biometricMappingService: BiometricMappingService) {
    this.staffForm = this.fb.group({
      _id: [''],
      adminId: [''],
      name: ['', Validators.required],
      departmentId: ['', Validators.required],
      designationId: ['', Validators.required],
      joiningDate: ['', Validators.required],
      status: ['active'],
      empCode: [''],
    })
    this.assignCardForm = this.fb.group({
      cardNo: ['', Validators.required],
    })
  }

  ngOnInit(): void {
    let getAdmin = this.adminAuthService.getLoggedInAdminInfo();
    this.adminId = getAdmin?.id;
    let load: any = this.getStaff({ page: 1 });
    if (load) {
      setTimeout(() => {
        this.loader = false;
      }, 1000);
    }
    this.getDepartmentList();
    this.getDesignationList();
  }

  getDepartmentList() {
    this.departmentService.getDepartmentList(this.adminId).subscribe((res: any) => {
      if (res) {
        this.departmentInfo = res;
      }
    })
  }

  getDesignationList() {
    this.designationService.getDesignationList(this.adminId).subscribe((res: any) => {
      if (res) {
        this.designationInfo = res;
        this.filteredDesignationInfo = res;
      }
    })
  }

  getDepartmentName(id: String) {
    let department = this.departmentInfo.find((d: any) => d._id === id);
    return department ? department.name : '—';
  }

  getDesignationName(id: String) {
    let designation = this.designationInfo.find((d: any) => d._id === id);
    return designation ? designation.title : '—';
  }

  // Dependent-dropdown pattern: narrow Designation options to the selected Department
  filterDesignationsByDepartment(departmentId: String) {
    this.filteredDesignationInfo = departmentId
      ? this.designationInfo.filter((d: any) => d.departmentId === departmentId)
      : this.designationInfo;
  }

  onDepartmentChange(departmentId: String) {
    this.filterDesignationsByDepartment(departmentId);
    // Previously selected designation may no longer belong to the newly selected department
    this.staffForm.patchValue({ designationId: '' });
  }

  getStaff($event: any) {
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

      this.staffService.staffPaginationList(params).subscribe((res: any) => {
        if (res) {
          this.staffInfo = res.staffList;
          this.number = params.page;
          this.paginationValues.next({ type: 'page-init', page: params.page, totalTableRecords: res.countStaff });
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
  addStaffModel() {
    this.showModal = true;
    this.deleteMode = false;
    this.errorCheck = false;
    this.errorMsg = '';
    this.isClick = false;
    this.filteredDesignationInfo = this.designationInfo;
    this.staffForm.reset({ status: 'active' });
  }
  updateStaffModel(staff: any) {
    this.showModal = true;
    this.deleteMode = false;
    this.updateMode = true;
    this.errorCheck = false;
    this.errorMsg = '';
    this.isClick = false;
    this.filterDesignationsByDepartment(staff.departmentId);
    this.staffForm.patchValue({
      ...staff,
      joiningDate: staff.joiningDate ? new Date(staff.joiningDate) : '',
    });
  }
  deleteStaffModel(id: String) {
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
    this.getStaff({ page: 1 });
    setTimeout(() => {
      this.toastr.success('', res);
    }, 500)
  }

  staffAddUpdate() {
    if (this.staffForm.valid) {
      if (this.isClick) {
        return;
      }
      this.errorCheck = false;
      this.errorMsg = '';
      this.isClick = true;
      this.staffForm.value.adminId = this.adminId;
      if (this.updateMode) {
        this.staffService.updateStaff(this.staffForm.value).subscribe((res: any) => {
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
        this.staffService.addStaff(this.staffForm.value).subscribe((res: any) => {
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

  staffDelete(id: String) {
    if (this.isClick) {
      return;
    }
    this.isClick = true;
    this.staffService.deleteStaff(id).subscribe((res: any) => {
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

  openAssignCardModal(staff: any) {
    this.assignCardPerson = staff;
    this.assignCardForm.reset();
    this.assignCardErrorCheck = false;
    this.assignCardErrorMsg = '';
    this.assignCardIsClick = false;
    this.showAssignCardModal = true;
  }

  closeAssignCardModal() {
    this.showAssignCardModal = false;
    this.assignCardPerson = null;
  }

  assignCard() {
    if (this.assignCardForm.valid && this.assignCardPerson) {
      if (this.assignCardIsClick) {
        return;
      }
      this.assignCardIsClick = true;
      let params: any = {
        adminId: this.adminId,
        personType: 'staff',
        personId: this.assignCardPerson._id,
        cardNo: this.assignCardForm.value.cardNo,
      };
      // STEP 1 (local BiometricMapping upsert) and STEP 2 (WDMS sync) both happen
      // server-side in one call; wdmsSyncFailed tells us whether STEP 2 failed so the
      // local save (which always succeeds first) can still be reported as a success.
      this.biometricMappingService.assignCard(params).subscribe((res: any) => {
        this.assignCardIsClick = false;
        this.closeAssignCardModal();
        if (res && res.wdmsSyncFailed) {
          setTimeout(() => {
            this.toastr.warning('Card saved, but syncing to the biometric device failed — it will need to be retried.', 'Partial Success');
          }, 500);
        } else {
          setTimeout(() => {
            this.toastr.success('', res.successMsg);
          }, 500);
        }
      }, err => {
        this.assignCardIsClick = false;
        this.assignCardErrorCheck = true;
        this.assignCardErrorMsg = err.error;
      });
    }
  }

  openBulkAssignCardModal() {
    this.showBulkAssignCardModal = true;
    this.bulkAssignCardFile = null;
    this.bulkAssignCardErrorMsg = '';
    this.bulkAssignCardResult = null;
    this.bulkAssignCardIsClick = false;
  }

  closeBulkAssignCardModal() {
    this.showBulkAssignCardModal = false;
    this.bulkAssignCardFile = null;
    this.bulkAssignCardResult = null;
  }

  onBulkAssignCardFileChange(event: any) {
    const file = event.target.files && event.target.files.length ? event.target.files[0] : null;
    this.bulkAssignCardFile = file;
    this.bulkAssignCardErrorMsg = '';
  }

  // 2-column CSV (code, cardNo), header row always skipped — keeps parsing simple
  // rather than pulling in a CSV library for a two-field format.
  parseBulkAssignCardCsv(text: string): any[] {
    const lines = text.split(/\r\n|\n/).map(l => l.trim()).filter(l => l.length > 0);
    const records: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      const code = (parts[0] || '').trim();
      const cardNo = (parts[1] || '').trim();
      if (code || cardNo) {
        records.push({ code, cardNo });
      }
    }
    return records;
  }

  bulkAssignCardSubmit() {
    if (!this.bulkAssignCardFile) {
      this.bulkAssignCardErrorMsg = 'Please choose a CSV file.';
      return;
    }
    if (this.bulkAssignCardIsClick) {
      return;
    }
    this.bulkAssignCardIsClick = true;
    this.bulkAssignCardErrorMsg = '';
    const reader = new FileReader();
    reader.onload = () => {
      const records = this.parseBulkAssignCardCsv(reader.result as string);
      if (records.length === 0) {
        this.bulkAssignCardIsClick = false;
        this.bulkAssignCardErrorMsg = 'No valid rows found in the CSV file.';
        return;
      }
      let params: any = {
        adminId: this.adminId,
        personType: 'staff',
        records: records,
      };
      this.biometricMappingService.bulkAssignCard(params).subscribe((res: any) => {
        this.bulkAssignCardIsClick = false;
        this.bulkAssignCardResult = res;
        this.getStaff({ page: 1 });
      }, err => {
        this.bulkAssignCardIsClick = false;
        this.bulkAssignCardErrorMsg = err.error || 'Bulk upload failed.';
      });
    };
    reader.readAsText(this.bulkAssignCardFile);
  }
}

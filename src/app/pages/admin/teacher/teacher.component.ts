import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormArray } from '@angular/forms';
import { Subject } from 'rxjs';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { TeacherService } from 'src/app/services/teacher.service';
import { Teacher } from 'src/app/modal/teacher.model';
import { ClassService } from 'src/app/services/class.service';
import { BiometricMappingService } from 'src/app/services/biometric-mapping.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-teacher',
  templateUrl: './teacher.component.html',
  styleUrls: ['./teacher.component.css']
})
export class TeacherComponent implements OnInit {
  teacherForm: FormGroup;
  teacherPermissionForm: FormGroup;
  showModal: boolean = false;
  showTeacherPermissionModal: boolean = false;
  updateMode: boolean = false;
  deleteMode: boolean = false;
  deleteById: String = '';
  successMsg: String = '';
  errorMsg: String = '';
  errorCheck: Boolean = false;
  teacherInfo: any[] = [];

  recordLimit: number = 0;
  filters: any = {};
  number: number = 0;
  paginationValues: Subject<any> = new Subject();
  page: Number = 0;
  classInfo: any[] = [];
  selectedMarksheetPermissionClass: any[] = [];
  selectedStudentPermissionClass: any[] = [];
  selectedAdmissionPermissionClass: any[] = [];
  selectedFeeCollectionPermissionClass: any[] = [];
  selectedAdmitCardPermissionClass: any[] = [];
  selectedPromoteFailPermissionClass: any[] = [];
  selectedTransferCertificatePermissionClass: any[] = [];
  teacherObjId: string = '';

  loader: Boolean = true;
  adminId!: String

  // Assign Card modal state
  showAssignCardModal: boolean = false;
  assignCardForm: FormGroup;
  assignCardPerson: any = null;
  assignCardIsClick: boolean = false;
  assignCardErrorCheck: boolean = false;
  assignCardErrorMsg: string = '';
  // How the terminal is allowed to identify this person. Pushed to WDMS as verify_mode.
  // Card Only is the default because a card is the only credential Schoolzen issues —
  // fingerprints and faces are enrolled at the device itself.
  verifyModeOptions: any[] = [
    { value: 4, label: 'Card Only' },
    { value: 0, label: 'Auto' },
    { value: 1, label: 'Fingerprint' },
    { value: 3, label: 'Password' },
    { value: 15, label: 'Face' },
  ];
  // Separate from assignCardIsClick: a resync can be fired from a table row with no modal
  // open, so the two guards must not share a flag.
  resyncIsClick: boolean = false;

  // Bulk Assign Card (CSV) modal state
  showBulkAssignCardModal: boolean = false;
  bulkAssignCardFile: File | null = null;
  bulkAssignCardIsClick: boolean = false;
  bulkAssignCardErrorMsg: string = '';
  bulkAssignCardResult: { successCount: number, failedCount: number, failed: any[] } | null = null;

  constructor(private fb: FormBuilder, private toastr: ToastrService, private adminAuthService: AdminAuthService, private teacherService: TeacherService, private classService: ClassService, private biometricMappingService: BiometricMappingService) {
    this.teacherForm = this.fb.group({
      _id: [''],
      adminId: [''],
      name: ['', [Validators.required, Validators.pattern('^[a-zA-Z\\s]+$')]],
      teacherUserId: ['', [Validators.required, Validators.pattern(/^\d{6}$/), Validators.pattern('^[0-9]+$')]],
      education: ['', [Validators.required, Validators.pattern('^[a-zA-Z.\\s]+$')]],
    })
    this.assignCardForm = this.fb.group({
      cardNo: ['', Validators.required],
      verifyMode: [4],
    })
    this.teacherPermissionForm = this.fb.group({
      _id: [''],
      adminId: this.adminId,
      type: this.fb.group({
        marksheetPermission: this.fb.array([], [Validators.required]),
        admitCardPermission: this.fb.array([], [Validators.required]),
        studentPermission: this.fb.array([], [Validators.required]),
        admissionPermission: this.fb.array([], [Validators.required]),
        feeCollectionPermission: this.fb.array([], [Validators.required]),
        promoteFailPermission: this.fb.array([], [Validators.required]),
        transferCertificatePermission: this.fb.array([], [Validators.required]),
      }),
    });
  }

  ngOnInit(): void {
    let getAdmin = this.adminAuthService.getLoggedInAdminInfo();
    this.adminId = getAdmin?.id;
    let load: any = this.getTeacher({ page: 1 });
    this.getClass();
    if (load) {
      setTimeout(() => {
        this.loader = false;
      }, 1000);
    }
  }
  getClass() {
    this.classService.getClassList().subscribe((res: any) => {
      if (res) {
        let classArray = [];
        for (let i = 0; i < res.length; i++) {
          classArray.push(res[i].class);
        }
        this.classInfo = classArray;
      }
    })
  }
  marksheetPermission(option: number, event: any) {
    if (event.checked) {
      if (!this.selectedMarksheetPermissionClass.includes(option)) {
        this.selectedMarksheetPermissionClass.push(option);
      }
    } else {
      this.selectedMarksheetPermissionClass = this.selectedMarksheetPermissionClass.filter(cls => cls !== option);
    }
  }

  studentPermission(option: number, event: any) {
    if (event.checked) {
      if (!this.selectedStudentPermissionClass.includes(option)) {
        this.selectedStudentPermissionClass.push(option);
      }
    } else {
      this.selectedStudentPermissionClass = this.selectedStudentPermissionClass.filter(cls => cls !== option);
    }
  }

  admissionPermission(option: number, event: any) {
    if (event.checked) {
      if (!this.selectedAdmissionPermissionClass.includes(option)) {
        this.selectedAdmissionPermissionClass.push(option);
      }
    } else {
      this.selectedAdmissionPermissionClass = this.selectedAdmissionPermissionClass.filter(cls => cls !== option);
    }
  }

  feeCollectionPermission(option: number, event: any) {
    if (event.checked) {
      if (!this.selectedFeeCollectionPermissionClass.includes(option)) {
        this.selectedFeeCollectionPermissionClass.push(option);
      }
    } else {
      this.selectedFeeCollectionPermissionClass = this.selectedFeeCollectionPermissionClass.filter(cls => cls !== option);
    }
  }

  admitCardPermission(option: number, event: any) {
    if (event.checked) {
      if (!this.selectedAdmitCardPermissionClass.includes(option)) {
        this.selectedAdmitCardPermissionClass.push(option);
      }
    } else {
      this.selectedAdmitCardPermissionClass = this.selectedAdmitCardPermissionClass.filter(cls => cls !== option);
    }
  }

  promoteFailPermission(option: number, event: any) {
    if (event.checked) {
      if (!this.selectedPromoteFailPermissionClass.includes(option)) {
        this.selectedPromoteFailPermissionClass.push(option);
      }
    } else {
      this.selectedPromoteFailPermissionClass = this.selectedPromoteFailPermissionClass.filter(cls => cls !== option);
    }
  }

  transferCertificatePermission(option: number, event: any) {
    if (event.checked) {
      if (!this.selectedTransferCertificatePermissionClass.includes(option)) {
        this.selectedTransferCertificatePermissionClass.push(option);
      }
    } else {
      this.selectedTransferCertificatePermissionClass = this.selectedTransferCertificatePermissionClass.filter(cls => cls !== option);
    }
  }

  isMarksheetPermissionSelected(option: number): boolean {
    return this.selectedMarksheetPermissionClass.includes(option);
  }
  isStudentPermissionSelected(option: number): boolean {
    return this.selectedStudentPermissionClass.includes(option);
  }
  isAdmissionPermissionSelected(option: number): boolean {
    return this.selectedAdmissionPermissionClass.includes(option);
  }
  isFeeCollectionPermissionSelected(option: number): boolean {
    return this.selectedFeeCollectionPermissionClass.includes(option);
  }
  isAdmitCardPermissionSelected(option: number): boolean {
    return this.selectedAdmitCardPermissionClass.includes(option);
  }
  isPromoteFailPermissionSelected(option: number): boolean {
    return this.selectedPromoteFailPermissionClass.includes(option);
  }
  isTransferCertificatePermissionSelected(option: number): boolean {
    return this.selectedTransferCertificatePermissionClass.includes(option);
  }

  getTeacher($event: any) {
    this.page = $event.page;
    return new Promise((resolve, reject) => {
      let params: any = {
        filters: {},
        page: $event.page,
        limit: $event.limit ? $event.limit : this.recordLimit,
        adminId: this.adminId
      };
      this.recordLimit = params.limit;
      if (this.filters.searchText) {
        params["filters"]["searchText"] = this.filters.searchText.trim();
      }

      this.teacherService.teacherPaginationList(params).subscribe((res: any) => {
        if (res) {
          this.teacherInfo = res.teacherList;
          this.number = params.page;
          this.selectedMarksheetPermissionClass = [...res.teacherList[0].marksheetPermission.classes];
          this.selectedStudentPermissionClass = [...res.teacherList[0].studentPermission.classes];
          this.selectedAdmissionPermissionClass = [...res.teacherList[0].admissionPermission.classes];
          this.selectedFeeCollectionPermissionClass = [...res.teacherList[0].feeCollectionPermission.classes];
          this.selectedAdmitCardPermissionClass = [...res.teacherList[0].admitCardPermission.classes];
          this.selectedPromoteFailPermissionClass = [...res.teacherList[0].promoteFailPermission.classes];
          this.selectedTransferCertificatePermissionClass = [...res.teacherList[0].transferCertificatePermission.classes];
          this.paginationValues.next({ type: 'page-init', page: params.page, totalTableRecords: res.countTeacher });
          return resolve(true);
        }
      });
    });
  }

  falseAllValue() {
    const controlOne = <FormArray>this.teacherPermissionForm.get('type.marksheetPermission');
    const controlTwo = <FormArray>this.teacherPermissionForm.get('type.studentPermission');
    const controlThree = <FormArray>this.teacherPermissionForm.get('type.admissionPermission');
    const controlFour = <FormArray>this.teacherPermissionForm.get('type.admitCardPermission');
    const controlFive = <FormArray>this.teacherPermissionForm.get('type.feeCollectionPermission');
    const controlSix = <FormArray>this.teacherPermissionForm.get('type.promoteFailPermission');
    const controlSeven = <FormArray>this.teacherPermissionForm.get('type.transferCertificatePermission');
    controlOne.clear();
    controlTwo.clear();
    controlThree.clear();
    controlFour.clear();
    controlFive.clear();
    controlSix.clear();
    controlSeven.clear();
    this.teacherObjId = '';
    this.teacherPermissionForm.reset();

  }
  closeModal() {
    this.falseAllValue();
    this.showModal = false;
    this.showTeacherPermissionModal = false;
    this.updateMode = false;
    this.deleteMode = false;
    this.errorMsg = '';
    this.getTeacher({ page: this.page });
  }
  addTeacherModel() {
    this.showModal = true;
    this.showTeacherPermissionModal = false;
    this.deleteMode = false;
    this.teacherForm.reset();
  }
  addTeacherPermissionModel(teacher: any) {
    this.showModal = false;
    this.showTeacherPermissionModal = true;
    this.teacherObjId = teacher._id;
    this.teacherPermissionForm.reset();
  }
  updateTeacherModel(teacher: Teacher) {
    this.showModal = true;
    this.showTeacherPermissionModal = false;
    this.deleteMode = false;
    this.updateMode = true;
    this.teacherForm.patchValue(teacher);
  }
  deleteTeacherModel(id: String) {
    this.showModal = true;
    this.showTeacherPermissionModal = false;
    this.updateMode = false;
    this.deleteMode = true;
    this.deleteById = id;
  }

  successDone(msg: any) {
    this.closeModal();
    this.successMsg = '';
    this.getTeacher({ page: this.page });
    setTimeout(() => {
      this.toastr.success('',msg);
    }, 500)
  }

  patch() {
    const controlOne = <FormArray>this.teacherPermissionForm.get('type.marksheetPermission');
    this.selectedMarksheetPermissionClass.forEach((x: any) => {
      controlOne.push(this.patchMarksheetValues(x))
      this.teacherPermissionForm.reset();
    })
    const controlTwo = <FormArray>this.teacherPermissionForm.get('type.studentPermission');
    this.selectedStudentPermissionClass.forEach((x: any) => {
      controlTwo.push(this.patchStudentValues(x))
      this.teacherPermissionForm.reset();
    })
    const controlThree = <FormArray>this.teacherPermissionForm.get('type.admissionPermission');
    this.selectedAdmissionPermissionClass.forEach((x: any) => {
      controlThree.push(this.patchAdmissionValues(x))
      this.teacherPermissionForm.reset();
    })
    const controlFour = <FormArray>this.teacherPermissionForm.get('type.admitCardPermission');
    this.selectedAdmitCardPermissionClass.forEach((x: any) => {
      controlFour.push(this.patchAdmitCardValues(x))
      this.teacherPermissionForm.reset();
    })
    const controlFive = <FormArray>this.teacherPermissionForm.get('type.feeCollectionPermission');
    this.selectedFeeCollectionPermissionClass.forEach((x: any) => {
      controlFive.push(this.patchFeeCollectionValues(x))
      this.teacherPermissionForm.reset();
    })
    const controlSix = <FormArray>this.teacherPermissionForm.get('type.promoteFailPermission');
    this.selectedPromoteFailPermissionClass.forEach((x: any) => {
      controlSix.push(this.patchPromoteFailValues(x))
      this.teacherPermissionForm.reset();
    })
    const controlSeven = <FormArray>this.teacherPermissionForm.get('type.transferCertificatePermission');
    this.selectedTransferCertificatePermissionClass.forEach((x: any) => {
      controlSeven.push(this.patchTransferCertificateValues(x))
      this.teacherPermissionForm.reset();
    })

  }
  patchMarksheetValues(selectedMarksheetPermissionClass: any) {
    return this.fb.group(
      { [selectedMarksheetPermissionClass]: [selectedMarksheetPermissionClass] }
    )
  }
  patchStudentValues(selectedStudentPermissionClass: any) {
    return this.fb.group(
      { [selectedStudentPermissionClass]: [selectedStudentPermissionClass] }
    )
  }
  patchAdmissionValues(selectedAdmissionPermissionClass: any) {
    return this.fb.group(
      { [selectedAdmissionPermissionClass]: [selectedAdmissionPermissionClass] }
    )
  }
  patchAdmitCardValues(selectedAdmitCardPermissionClass: any) {
    return this.fb.group(
      { [selectedAdmitCardPermissionClass]: [selectedAdmitCardPermissionClass] }
    )
  }
  patchFeeCollectionValues(selectedFeeCollectionPermissionClass: any) {
    return this.fb.group(
      { [selectedFeeCollectionPermissionClass]: [selectedFeeCollectionPermissionClass] }
    )
  }
  patchPromoteFailValues(selectedPromoteFailPermissionClass: any) {
    return this.fb.group(
      { [selectedPromoteFailPermissionClass]: [selectedPromoteFailPermissionClass] }
    )
  }
  patchTransferCertificateValues(selectedTransferCertificatePermissionClass: any) {
    return this.fb.group(
      { [selectedTransferCertificatePermissionClass]: [selectedTransferCertificatePermissionClass] }
    )
  }

  teacherAddUpdate() {
    if (this.teacherForm.valid) {
      this.teacherForm.value.adminId = this.adminId;
      if (this.updateMode) {
        this.teacherService.updateTeacher(this.teacherForm.value).subscribe((res: any) => {
          if (res) {
            this.successDone(res);
          }
        }, err => {
          this.errorCheck = true;
          this.errorMsg = err.error;
        })
      } else {
        this.teacherService.addTeacher(this.teacherForm.value).subscribe((res: any) => {
          if (res) {
            this.successDone(res);
          }
        }, err => {
          this.errorCheck = true;
          this.errorMsg = err.error;
        })
      }
    }
  }

  teacherPermissionAdd() {
    this.patch();
    this.teacherPermissionForm.value._id = this.teacherObjId;
    this.teacherPermissionForm.value.adminId = this.adminId;
    this.teacherService.addTeacherPermission(this.teacherPermissionForm.value).subscribe((res: any) => {
      if (res) {
        this.successDone(res);
      }
    }, err => {
      this.errorCheck = true;
      this.errorMsg = err.error;
    })
  }

  changeStatus(id: any, statusValue: any) {
    if (id) {
      let params = {
        id: id,
        statusValue: statusValue,
      }
      this.teacherService.changeStatus(params).subscribe((res: any) => {
        if (res) {
          this.successDone(res);
        }
      })
    }
  }

  teacherDelete(id: String) {
    this.teacherService.deleteTeacher(id).subscribe((res: any) => {
      if (res) {
        this.successDone(res);
        this.deleteById = '';
      }
    })
  }

  openAssignCardModal(teacher: any) {
    this.assignCardPerson = teacher;
    // Card Only, matching the model default — the existing mapping is not loaded here, so
    // the form always opens on the default rather than silently showing a stale mode.
    this.assignCardForm.reset({ cardNo: '', verifyMode: 4 });
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
        personType: 'teacher',
        personId: this.assignCardPerson._id,
        cardNo: this.assignCardForm.value.cardNo,
        verifyMode: this.assignCardForm.value.verifyMode,
      };
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

  // Re-push this person to the terminals on demand. WDMS syncing is best-effort, so a card
  // assigned while a device was offline is saved locally but never reaches the door — this
  // is the retry, without having to re-enter the card number.
  // Called from the table row (no modal) and from the Assign Card modal footer, where it
  // also saves whatever verify mode is currently selected.
  resyncToDevice(teacher: any, fromModal: boolean = false) {
    if (this.resyncIsClick) {
      return;
    }
    this.resyncIsClick = true;
    let params: any = {
      adminId: this.adminId,
      personType: 'teacher',
      personId: teacher._id,
    };
    if (fromModal) params.verifyMode = this.assignCardForm.value.verifyMode;

    this.biometricMappingService.resyncToDevice(params).subscribe((res: any) => {
      this.resyncIsClick = false;
      if (fromModal) this.closeAssignCardModal();
      if (res && res.wdmsSyncFailed) {
        setTimeout(() => {
          this.toastr.warning('Could not reach the biometric device — try again once it is online.', 'Resync Failed');
        }, 500);
      } else {
        setTimeout(() => {
          this.toastr.success('', res.successMsg);
        }, 500);
      }
    }, err => {
      this.resyncIsClick = false;
      if (fromModal) {
        this.assignCardErrorCheck = true;
        this.assignCardErrorMsg = err.error;
      } else {
        setTimeout(() => {
          this.toastr.error('', err.error);
        }, 500);
      }
    });
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
        personType: 'teacher',
        records: records,
      };
      this.biometricMappingService.bulkAssignCard(params).subscribe((res: any) => {
        this.bulkAssignCardIsClick = false;
        this.bulkAssignCardResult = res;
        this.getTeacher({ page: this.page });
      }, err => {
        this.bulkAssignCardIsClick = false;
        this.bulkAssignCardErrorMsg = err.error || 'Bulk upload failed.';
      });
    };
    reader.readAsText(this.bulkAssignCardFile);
  }
}

import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormArray } from '@angular/forms';
import { Subject } from 'rxjs';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { TeacherService } from 'src/app/services/teacher.service';
import { Teacher } from 'src/app/modal/teacher.model';
import { ClassService } from 'src/app/services/class.service';
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
  constructor(private fb: FormBuilder, private toastr: ToastrService, private adminAuthService: AdminAuthService, private teacherService: TeacherService, private classService: ClassService) {
    this.teacherForm = this.fb.group({
      _id: [''],
      adminId: [''],
      name: ['', [Validators.required, Validators.pattern('^[a-zA-Z\\s]+$')]],
      teacherUserId: ['', [Validators.required, Validators.pattern(/^\d{6}$/), Validators.pattern('^[0-9]+$')]],
      education: ['', [Validators.required, Validators.pattern('^[a-zA-Z.\\s]+$')]],
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
}

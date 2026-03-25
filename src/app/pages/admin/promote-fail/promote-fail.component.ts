import { Component, ElementRef, ViewChild, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { StudentService } from 'src/app/services/student.service';
import { ClassService } from 'src/app/services/class.service';
import { MatRadioChange } from '@angular/material/radio';
import { ExcelService } from 'src/app/services/excel/excel.service';
import { SchoolService } from 'src/app/services/school.service';
import { HttpClient } from '@angular/common/http';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ClassSubjectService } from 'src/app/services/class-subject.service';
import { IssuedTransferCertificateService } from 'src/app/services/issued-transfer-certificate.service';
import { ToastrService } from 'ngx-toastr';


@Component({
  selector: 'app-promote-fail',
  templateUrl: './promote-fail.component.html',
  styleUrls: ['./promote-fail.component.css']
})
export class PromoteFailComponent implements OnInit {
  @ViewChild('content') content!: ElementRef;
  studentClassPromoteForm: FormGroup;
  showClassPromoteModal: boolean = false;


  studentClassFailForm: FormGroup;
  showClassFailModal: boolean = false;


  showStudentInfoViewModal: boolean = false;
  showStudentTCModal: boolean = false;
  updateMode: boolean = false;
  deleteMode: boolean = false;
  deleteById: String = '';
  errorMsg: String = '';
  errorCheck: Boolean = false;
  statusCode: Number = 0;
  classInfo: any[] = [];
  studentInfo: any[] = [];
  studentInfoByClass: any[] = [];
  recordLimit: number = 10;
  filters: any = {};
  number: number = 0;
  paginationValues: Subject<any> = new Subject();
  page: Number = 0;
  selectedValue: number = 0;
  stream: string = '';
  notApplicable: string = "stream";
  streamMainSubject: any[] = ['mathematics(science)', 'biology(science)', 'history(arts)', 'sociology(arts)', 'political science(arts)', 'accountancy(commerce)', 'economics(commerce)', 'agriculture', 'home science'];
  cls: number = 0;
  className: any;
  admissionType: string = '';
  schoolInfo: any;
  bulkStudentRecord: any;
  fileChoose: boolean = false;
  loader: Boolean = true;
  promotedClass: any;
  failClass: any;
  singleStudentInfo: any
  singleStudentTCInfo: any
  classSubject: any[] = [];
  serialNo!: number;
  isDate: string = '';
  readyTC: Boolean = false;
  baseURL!: string;
  adminId!: String
  constructor(private fb: FormBuilder, public activatedRoute: ActivatedRoute, private toastr: ToastrService, private schoolService: SchoolService, public ete: ExcelService, private adminAuthService: AdminAuthService, private issuedTransferCertificate: IssuedTransferCertificateService, private classService: ClassService, private classSubjectService: ClassSubjectService, private studentService: StudentService) {
    this.studentClassPromoteForm = this.fb.group({
      _id: ['', Validators.required],
      session: ['', Validators.required],
      admissionNo: ['', Validators.required],
      adminId: [''],
      class: [''],
      stream: [''],
      rollNumber: ['', Validators.required],
      feesConcession: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
      createdBy: ['']
    })

    this.studentClassFailForm = this.fb.group({
      _id: ['', Validators.required],
      session: ['', Validators.required],
      admissionNo: ['', Validators.required],
      adminId: [''],
      class: [''],
      stream: ['', Validators.required],
      rollNumber: ['', Validators.required],
      feesConcession: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
      createdBy: ['']
    })

  }

  ngOnInit(): void {
    let getAdmin = this.adminAuthService.getLoggedInAdminInfo();
    this.adminId = getAdmin?.id;
    this.loader = false;
    this.getSchool();
    this.getClass();
    var currentURL = window.location.href;
    this.baseURL = new URL(currentURL).origin;
  }

  getSchool() {
    this.schoolService.getSchool(this.adminId).subscribe((res: any) => {
      if (res) {
        this.schoolInfo = res;
      }
    })
  }
  chooseClass(cls: any) {
    this.page = 0;
    this.className = cls;
    this.cls = cls;
    if (cls !== 11 && cls !== 12) {
      this.stream = this.notApplicable;
      this.studentInfo = [];
      this.getStudents({ page: 1 });
    }
    if (cls == 11 || cls == 12) {
      if (this.stream == 'stream') {
        this.stream = '';
      }
      this.studentInfo = [];
      this.getStudents({ page: 1 });
    }
  }
  filterStream(stream: any) {
    this.stream = stream;
    if (stream && this.cls) {
      let params = {
        adminId: this.adminId,
        cls: this.cls,
        stream: stream,
      }
      this.getStudents({ page: 1 });
    }
  }
  chooseStream(event: any) {
    this.stream = event.value;
  }

  onChange(event: MatRadioChange) {
    this.selectedValue = event.value;
  }
  closeModal() {
    this.showClassPromoteModal = false;
    this.showClassFailModal = false;
    this.showStudentInfoViewModal = false;
    this.showStudentTCModal = false;
    this.updateMode = false;
    this.deleteMode = false;
    this.errorCheck = false;
    this.errorMsg = '';
    this.classSubject = [];
    this.promotedClass;
    this.failClass;
    this.singleStudentInfo;
    this.singleStudentTCInfo;
    this.studentClassPromoteForm.reset();
  }


  addStudentClassPromoteModel(student: any) {
    this.showClassPromoteModal = true;
    this.singleStudentInfo = student;
    let sessionYears = student.session.split("-");
    let startYear = parseInt(sessionYears[0]);
    let endYear = parseInt(sessionYears[1]);
    let newStartYear = startYear + 1;
    let newEndYear = endYear + 1;
    let newSession = newStartYear + "-" + newEndYear;
    this.studentClassPromoteForm.patchValue(student);
    this.studentClassPromoteForm.get('session')?.setValue(newSession);
    this.studentClassPromoteForm.get('stream')?.setValue(this.stream);
    this.studentClassPromoteForm.get('feesConcession')?.setValue(null);
  }


  addStudentClassFailModel(student: any) {
    this.showClassFailModal = true;
    this.singleStudentInfo = student;
    let sessionYears = student.session.split("-");
    let startYear = parseInt(sessionYears[0]);
    let endYear = parseInt(sessionYears[1]);
    let newStartYear = startYear + 1;
    let newEndYear = endYear + 1;
    let newSession = newStartYear + "-" + newEndYear;
    this.studentClassFailForm.patchValue(student);
    this.studentClassFailForm.get('session')?.setValue(newSession);
    this.studentClassFailForm.get('stream')?.setValue(student.stream);
    this.studentClassFailForm.get('feesConcession')?.setValue(null);
  }



  addStudentInfoViewModel(student: any) {
    this.showStudentInfoViewModal = true;
    this.singleStudentInfo = student;
  }
  addStudentTCModel(student: any) {
    this.showStudentTCModal = true;
    this.singleStudentInfo = student;
    let stream: String = student.stream;
    if (stream == "n/a") {
      stream = this.notApplicable;
    }
    let params = {
      cls: student.class,
      stream: stream,
      adminId: this.adminId,
    }
    this.getSingleClassSubjectByStream(params);
  }
  updateStudentModel(student: any) {
    this.deleteMode = false;
    this.updateMode = true;
  }
  deleteStudentModel(id: String) {
    this.updateMode = false;
    this.deleteMode = true;
    this.deleteById = id;
  }

  getClass() {
    this.classService.getClassList().subscribe((res: any) => {
      if (res) {
        this.classInfo = res;
      }
    })
  }
  getSingleClassSubjectByStream(params: any) {
    this.classSubjectService.getSingleClassSubjectByStream(params).subscribe((res: any) => {
      if (res) {
        this.classSubject = res.subject;
      }
      if (!res) {
        this.classSubject = [];
      }
    })
  }
  successDone(msg:any) {
    this.closeModal();
    this.getStudents({ page: this.page });
    setTimeout(() => {
      this.toastr.success('',msg);
    }, 500)
  }

  getStudentByClass(cls: any) {
    let params = {
      class: cls,
      stream: this.stream,
      adminId: this.adminId,
    }
    this.studentService.getStudentByClass(params).subscribe((res: any) => {
      if (res) {
        this.studentInfoByClass = res;
        const classMappings: any = {
          200: "Nursery",
          201: "LKG",
          202: "UKG",
          1: "1st",
          2: "2nd",
          3: "3rd",
        };
        for (let i = 4; i <= 12; i++) {
          classMappings[i] = i + "th";
        }
        this.studentInfoByClass.forEach((student) => {
          student.class = classMappings[student.class] || "Unknown";
          student.admissionClass = classMappings[student.admissionClass] || "Unknown";
        });
      }
    })
  }
  getStudents($event: any) {
    this.page = $event.page
    return new Promise((resolve, reject) => {
      let params: any = {
        filters: {},
        page: $event.page,
        limit: $event.limit ? $event.limit : this.recordLimit,
        adminId: this.adminId,
        class: this.className,
        stream: this.stream,
      };
      this.recordLimit = params.limit;
      if (this.filters.searchText) {
        params["filters"]["searchText"] = this.filters.searchText.trim();
      }

      this.studentService.studentPaginationList(params).subscribe((res: any) => {
        if (res) {
          this.errorCheck = false;
          this.statusCode = 200;
          this.studentInfo = res.studentList;
          this.serialNo = res.serialNo;
          this.isDate = res.isDate;
          this.number = params.page;
          this.paginationValues.next({ type: 'page-init', page: params.page, totalTableRecords: res.countStudent });
          return resolve(true);
        }
      }, err => {
        this.errorCheck = true;
        this.statusCode = err.status;
      });
    });
  }
  studentClassPromote() {
    if (this.studentClassPromoteForm.valid) {
      this.studentClassPromoteForm.value.adminId = this.adminId;
      this.studentClassPromoteForm.value.class = parseInt(this.className);
      this.studentClassPromoteForm.value.createdBy = 'Admin';
      this.studentService.studentClassPromote(this.studentClassPromoteForm.value).subscribe((res: any) => {
        if (res) {
          this.promotedClass;
          this.promotedClass = res.className;
          this.successDone(res.successMsg);
        }
      }, err => {
        this.errorCheck = true;
        this.promotedClass;
        if (err.error.className) {
          this.promotedClass = parseInt(err.error.className);
        }
        this.errorMsg = err.error.errorMsg;
      })
    }
  }


  studentClassFail() {
    if (this.studentClassFailForm.valid) {
      this.studentClassFailForm.value.adminId = this.adminId;
      this.studentClassFailForm.value.class = parseInt(this.className);
      this.studentClassFailForm.value.createdBy = 'Admin';
      this.studentService.studentClassFail(this.studentClassFailForm.value).subscribe((res: any) => {
        if (res) {
          this.failClass;
          this.failClass = res.className;
          this.successDone(res.successMsg);
        }
      }, err => {
        this.errorCheck = true;
        this.failClass;
        if (err.error.className) {
          this.failClass = parseInt(err.error.className);
        }
        this.errorMsg = err.error.errorMsg;
      })
    }
  }

  // studentClassPromote() {
  //   if (this.studentClassPromoteForm.valid) {
  //     this.studentClassPromoteForm.value.class = parseInt(this.className);
  //     this.studentService.studentClassPromote(this.studentClassPromoteForm.value).subscribe((res: any) => {
  //       if (res) {
  //         setTimeout(() => {
  //           this.successDone();
  //         }, 2000)
  //         this.promotedClass;
  //         this.promotedClass = res.className;
  //         this.successMsg = res.successMsg;
  //       }
  //     }, err => {
  //       this.errorCheck = true;
  //       this.promotedClass;
  //       if (err.error.className) {
  //         this.promotedClass = parseInt(err.error.className);
  //       }
  //       this.errorMsg = err.error.errorMsg;
  //     })
  //   }
  // }
}

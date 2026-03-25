import { Component, OnInit } from '@angular/core';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { Class } from 'src/app/modal/class.model';
// import { Subject } from 'src/app/modal/subject.model';
import { ClassSubject } from 'src/app/modal/class-subject.model';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ClassService } from 'src/app/services/class.service';
import { SubjectService } from 'src/app/services/subject.service';
import { ClassSubjectService } from 'src/app/services/class-subject.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-class-subject',
  templateUrl: './class-subject.component.html',
  styleUrls: ['./class-subject.component.css']
})
export class ClassSubjectComponent implements OnInit {
  cls: any;
  classSubjectForm: FormGroup;
  showModal: boolean = false;
  updateMode: boolean = false;
  deleteMode: boolean = false;
  deleteById: String = '';
  successMsg: String = '';
  errorMsg: String = '';
  errorCheck: Boolean = false;
  classInfo: any[] = [];
  subjectInfo: any[] = [];
  classSubjectInfo: any[] = [];
  selectedSubjectGroup: any[] = [];
  streamMainSubject: any[] = ['mathematics(science)', 'biology(science)', 'history(arts)', 'sociology(arts)', 'political science(arts)', 'accountancy(commerce)', 'economics(commerce)', 'agriculture', 'home science'];

  recordLimit: number = 5;
  filters: any = {};
  number: number = 0;
  paginationValues: Subject<any> = new Subject();
  loader: Boolean = true;
  adminId!: string;
  constructor(private fb: FormBuilder, private toastr: ToastrService, private adminAuthService: AdminAuthService, private classService: ClassService, private subjectService: SubjectService, private classSubjectService: ClassSubjectService) {
    this.classSubjectForm = this.fb.group({
      _id: [''],
      adminId: [''],
      class: ['', Validators.required],
      subject: [''],
      stream: ['', Validators.required],
    })
  }

  ngOnInit(): void {
    let getAdmin = this.adminAuthService.getLoggedInAdminInfo();
    this.adminId = getAdmin?.id;
    this.getClass();
    this.getSubject();
    let load: any = this.getClassSubject({ page: 1 });
    if (load) {
      setTimeout(() => {
        this.loader = false;
      }, 1000);
    }
  }

  closeModal() {
    this.showModal = false;
    this.updateMode = false;
    this.deleteMode = false;
    this.errorMsg = '';
    this.selectedSubjectGroup = [];
    this.classSubjectForm.reset();
  }
  addClassSubjectModel() {
    this.showModal = true;
    this.deleteMode = false;
    this.classSubjectForm.reset();
  }
  updateClassSubjectModel(classSubject: any) {
    this.showModal = true;
    this.deleteMode = false;
    this.updateMode = true;
    this.classSubjectForm.patchValue(classSubject);
  }
  deleteClassSubjectModel(id: String) {
    this.showModal = true;
    this.updateMode = false;
    this.deleteMode = true;
    this.deleteById = id;
  }

  successDone(msg:any) {
    this.closeModal();
    this.successMsg = '';
    this.getClassSubject({ page: 1 });
    setTimeout(() => {
      this.toastr.success('',msg);
    }, 500)
  }

  subjectGroup(option: any) {
    const checkSubjectindex = this.selectedSubjectGroup.indexOf(option);
    if (checkSubjectindex > -1) {
      this.selectedSubjectGroup.splice(checkSubjectindex, 1);
    } else {
      this.selectedSubjectGroup.push(option);
    }
  }

  chooseClass(cls: any) {
    this.cls = cls;
    if (cls < 11 && cls !== 0 || cls == 200 || cls == 201 || cls == 202) {
      this.classSubjectForm.get('stream')?.setValue("n/a");
    }
  }

  getClass() {
    this.classService.getClassList().subscribe((res: any) => {
      if (res) {
        this.classInfo = res;
      }
    })
  }
  getSubject() {
    this.subjectService.getSubjectList(this.adminId).subscribe((res: any) => {
      if (res) {
        this.subjectInfo = res;
      }
    })
  }

  getClassSubject($event: any) {
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

      this.classSubjectService.classSubjectPaginationList(params).subscribe((res: any) => {
        if (res) {
          this.classSubjectInfo = res.classSubjectList;
          this.number = params.page;
          this.paginationValues.next({ type: 'page-init', page: params.page, totalTableRecords: res.countClassSubject });
          return resolve(true);
        }
      });
    });
  }

  classSubjectAddUpdate() {
    if (this.classSubjectForm.valid) {
      this.classSubjectForm.value.adminId = this.adminId;
      if (this.updateMode) {
        this.classSubjectService.updateClassSubject(this.classSubjectForm.value).subscribe((res: any) => {
          if (res) {
            this.successDone(res);
          }
        }, err => {
          this.errorCheck = true;
          this.errorMsg = err.error;
        })
      } else {
        this.classSubjectForm.value.subject = this.selectedSubjectGroup;
        this.classSubjectService.addClassSubject(this.classSubjectForm.value).subscribe((res: any) => {
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

  classSubjectDelete(id: String) {
    this.classSubjectService.deleteClassSubject(id).subscribe((res: any) => {
      if (res) {
        this.successDone(res);
        this.deleteById = '';
      }
    })
  }
}

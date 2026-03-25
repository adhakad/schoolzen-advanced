import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
// import { Subject } from 'src/app/modal/subject.model';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { SubjectService } from 'src/app/services/subject.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-subject',
  templateUrl: './subject.component.html',
  styleUrls: ['./subject.component.css']
})
export class SubjectComponent implements OnInit {
  subjectForm: FormGroup;
  showModal: boolean = false;
  updateMode: boolean = false;
  deleteMode: boolean = false;
  deleteById: String = '';
  successMsg: String = '';
  errorMsg: String = '';
  errorCheck: Boolean = false;
  subjectInfo: any[] = [];

  recordLimit: number = 5;
  filters: any = {};
  number: number = 0;
  paginationValues: Subject<any> = new Subject();
  loader: Boolean = true;
  adminId!: string;
  constructor(private fb: FormBuilder, private toastr: ToastrService, private adminAuthService: AdminAuthService, private subjectService: SubjectService) {
    this.subjectForm = this.fb.group({
      _id: [''],
      adminId: [''],
      subject: ['', Validators.required],
    })
  }

  ngOnInit(): void {
    let getAdmin = this.adminAuthService.getLoggedInAdminInfo();
    this.adminId = getAdmin?.id;
    let load: any = this.getSubject({ page: 1 });
    if (load) {
      setTimeout(() => {
        this.loader = false;
      }, 1000);
    }
  }

  getSubject($event: any) {
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

      this.subjectService.subjectPaginationList(params).subscribe((res: any) => {
        if (res) {
          this.subjectInfo = res.subjectList;
          this.number = params.page;
          this.paginationValues.next({ type: 'page-init', page: params.page, totalTableRecords: res.countSubject });
          return resolve(true);
        }
      });
    });
  }

  closeModal() {
    this.showModal = false;
    this.updateMode = false;
    this.deleteMode = false;
    this.errorMsg = '';
  }
  addSubjectModel() {
    this.showModal = true;
    this.deleteMode = false;
    this.subjectForm.reset();
  }
  updateSubjectModel(subject: any) {
    this.showModal = true;
    this.deleteMode = false;
    this.updateMode = true;
    this.subjectForm.patchValue(subject);
  }
  deleteSubjectModel(id: String) {
    this.showModal = true;
    this.updateMode = false;
    this.deleteMode = true;
    this.deleteById = id;
  }

  successDone(res: any) {
    this.closeModal();
    this.successMsg = '';
    this.getSubject({ page: 1 });
    setTimeout(() => {
      this.toastr.success('',res);
    }, 500)
  }
  subjectAddUpdate() {
    if (this.subjectForm.valid) {
      this.subjectForm.value.adminId = this.adminId;
      if (this.updateMode) {
        this.subjectService.updateSubject(this.subjectForm.value).subscribe((res: any) => {
          if (res) {
            this.successDone(res);
          }
        }, err => {
          this.errorCheck = true;
          this.errorMsg = err.error;
        })
      } else {
        this.subjectService.addSubject(this.subjectForm.value).subscribe((res: any) => {
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

  subjectDelete(id: String) {
    this.subjectService.deleteSubject(id).subscribe((res: any) => {
      if (res) {
        this.successDone(res);
        this.deleteById = '';
      }
    })
  }
}
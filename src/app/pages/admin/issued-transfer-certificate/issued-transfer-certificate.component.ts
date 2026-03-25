import { Component, ElementRef, ViewChild, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { StudentService } from 'src/app/services/student.service';
import { ClassService } from 'src/app/services/class.service';
import { FeesStructureService } from 'src/app/services/fees-structure.service';
import { PrintPdfService } from 'src/app/services/print-pdf/print-pdf.service';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { SchoolService } from 'src/app/services/school.service';
import { IssuedTransferCertificateService } from 'src/app/services/issued-transfer-certificate.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-issued-transfer-certificate',
  templateUrl: './issued-transfer-certificate.component.html',
  styleUrls: ['./issued-transfer-certificate.component.css']
})
export class IssuedTransferCertificateComponent implements OnInit {
  @ViewChild('receipt') receipt!: ElementRef;
  showModal: boolean = false;
  showStudentInfoViewModal: boolean = false;
  deleteMode: boolean = false;
  deleteById: String = '';
  errorMsg: String = '';
  errorCheck: Boolean = false;
  classInfo: any[] = [];
  studentInfo: any[] = [];
  recordLimit: number = 10;
  filters: any = {};
  number: number = 0;
  paginationValues: Subject<any> = new Subject();
  page: Number = 0;

  singleStudentInfo: any;
  cls: number = 0;
  schoolInfo: any;
  loader: Boolean = true;
  adminId!: any;
  constructor(private schoolService: SchoolService, private toastr: ToastrService, private adminAuthService: AdminAuthService, private printPdfService: PrintPdfService, private issuedTransferCertificate: IssuedTransferCertificateService) { }

  ngOnInit(): void {
    let getAdmin = this.adminAuthService.getLoggedInAdminInfo();
    this.adminId = getAdmin?.id;
    this.getSchool();
    let load: any = this.getIssuedTransferCertificate({ page: 1 });
    if (load) {
      setTimeout(() => {
        this.loader = false;
      }, 1000);
    }
  }
  getSchool() {
    this.schoolService.getSchool(this.adminId).subscribe((res: any) => {
      if (res) {
        this.schoolInfo = res;
      }
    })
  }
  closeModal() {
    this.showModal = false;
    this.showStudentInfoViewModal = false;
    this.deleteMode = false;
    this.errorCheck = false;
    this.errorMsg = '';
    this.singleStudentInfo = false;
  }
  addStudentInfoViewModel(student: any) {
    this.showStudentInfoViewModal = true;
    this.singleStudentInfo = student;
  }
  deleteIssuedTransferCertificateModel(id: String) {
    this.showModal = true;
    this.deleteMode = true;
    this.deleteById = id;
  }
  successDone(msg: any) {
    this.closeModal();
    this.getIssuedTransferCertificate({ page: this.page });
    setTimeout(() => {
      this.toastr.success('',msg);
    }, 500)
  }
  transferCertificateDelete(id: any) {
    this.issuedTransferCertificate.deleteIssuedTransferCertificate(id).subscribe((res: any) => {
      if (res) {
        this.successDone(res);
        this.deleteById = '';
      }
    }, err => {
      this.errorCheck = true;
      this.errorMsg = err.error;
    })
  }
  getIssuedTransferCertificate($event: any) {
    this.page = $event.page
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

      this.issuedTransferCertificate.issuedTransferCertificatePagination(params).subscribe((res: any) => {
        if (res) {
          this.studentInfo = res.issuedTransferCertificateList;
          this.number = params.page;
          this.paginationValues.next({ type: 'page-init', page: params.page, totalTableRecords: res.countIssuedTransferCertificate });
          return resolve(true);
        }
      });
    });
  }
}

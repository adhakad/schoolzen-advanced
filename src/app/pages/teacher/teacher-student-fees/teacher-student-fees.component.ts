import { Component, ElementRef, ViewChild, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormGroup, FormBuilder, Validators, FormArray } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { read, utils, writeFile } from 'xlsx';
import { FeesService } from 'src/app/services/fees.service';
import { MatRadioChange } from '@angular/material/radio';
import { TeacherAuthService } from 'src/app/services/auth/teacher-auth.service';
import { TeacherService } from 'src/app/services/teacher.service';
import { FeesStructureService } from 'src/app/services/fees-structure.service';
import { PrintPdfService } from 'src/app/services/print-pdf/print-pdf.service';
import { SchoolService } from 'src/app/services/school.service';
import { ClassService } from 'src/app/services/class.service';
import { environment } from 'src/environments/environment';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-teacher-student-fees',
  templateUrl: './teacher-student-fees.component.html',
  styleUrls: ['./teacher-student-fees.component.css']
})
export class TeacherStudentFeesComponent implements OnInit {
  @ViewChild('receipt') receipt!: ElementRef;
  public baseUrl = environment.API_URL;
  feesForm: FormGroup;
  showModal: boolean = false;
  showPrintModal: boolean = false;
  updateMode: boolean = false;
  deleteMode: boolean = false;
  deleteById: String = '';
  errorMsg: String = '';
  errorCheck: Boolean = false;
  feesInfo: any[] = [1, 2, 3, 4, 5];
  recordLimit: number = 10;
  filters: any = {};
  number: number = 0;
  paginationValues: Subject<any> = new Subject();
  page: Number = 0;
  cls: number = 0;
  classInfo: any[] = [];

  classSubject: any;
  showBulkFeesModal: boolean = false;
  movies: any[] = [];
  selectedValue: number = 0;
  fileChoose: boolean = false;
  existRollnumber: number[] = [];
  clsFeesStructure: any;
  schoolInfo: any;
  studentList: any[] = [];
  singleStudent: any;
  paybleInstallment: any;
  payNow: boolean = false;
  receiptInstallment: any = {};
  receiptMode: boolean = false;

  stream: string = '';
  notApplicable: string = "stream";
  streamMainSubject: any[] = ['mathematics(science)', 'biology(science)', 'history(arts)', 'sociology(arts)', 'political science(arts)', 'accountancy(commerce)', 'economics(commerce)', 'agriculture', 'home science'];
  loader: Boolean = false;
  teacherInfo: any;
  createdBy: String = '';
  baseURL!: string;
  adminId!: string;
  receiptSession: any;

  // Add loading state management properties
  isClick: boolean = false;
  collectingStudentId: string = '';

  constructor(
    private fb: FormBuilder,
    private router: Router,
    public activatedRoute: ActivatedRoute,
    private toastr: ToastrService,
    private teacherAuthService: TeacherAuthService,
    private teacherService: TeacherService,
    private schoolService: SchoolService,
    private classService: ClassService,
    private printPdfService: PrintPdfService,
    private feesService: FeesService,
    private feesStructureService: FeesStructureService
  ) {
    this.feesForm = this.fb.group({
      adminId: [''],
      session: [''],
      class: [''],
      stream: [''],
      studentId: [''],
      feesAmount: ['', [Validators.required, Validators.min(1)]],
      createdBy: [''],
    });
  }

  ngOnInit(): void {
    this.teacherInfo = this.teacherAuthService.getLoggedInTeacherInfo();
    this.adminId = this.teacherInfo?.adminId;
    
    this.activatedRoute.queryParams.subscribe((params) => {
      this.cls = +params['cls'] || 0;
      this.stream = params['stream'] || '';
      if (this.cls) {
        this.getAllStudentFeesCollectionByClass();
      } else {
        this.cls = 0;
        this.stream = '';
        this.studentList = [];
      }
    });
    
    if (this.teacherInfo) {
      this.getTeacherById(this.teacherInfo);
    }
    this.getSchool();
  }

  getTeacherById(teacherInfo: any) {
    let params = {
      adminId: teacherInfo.adminId,
      teacherUserId: teacherInfo.id,
    }
    this.teacherService.getTeacherById(params).subscribe((res: any) => {
      if (res) {
        this.classInfo = res.feeCollectionPermission.classes;
        this.createdBy = `${res.name} (${res.teacherUserId})`;
      }
    })
  }

  formatCurrency(value: any): string {
    value = parseInt(value);
    if (typeof value === 'number') {
      return '₹ ' + value.toLocaleString(undefined);
    }
    return '₹ 0';
  }

  formatKey(key: any): string {
    if (typeof key === 'string') {
      return key.toUpperCase();
    }
    return '';
  }

  printStudentData() {
    // Check if already printing
    if (this.isClick) {
      return;
    }

    this.isClick = true;
    
    try {
      const printContent = this.getPrintContent();
      this.printPdfService.printContent(printContent);
      
      // Add a small delay to show the loading state
      setTimeout(() => {
        this.isClick = false;
        this.closeModal();
      }, 1000);
    } catch (error) {
      this.isClick = false;
      this.toastr.error('Error occurred while printing', 'Print Error');
    }
  }

  private getPrintContent(): string {
    let schoolLogo = this.schoolInfo.schoolLogo;

    let printHtml = '<html>';
    printHtml += '<head>';
    printHtml += '<style>';
    printHtml += '@page { size: A3; margin: 10mm; }';
    printHtml += 'body {width: 100%; height: 100%; margin: 0; padding: 0; position: relative; }';
    printHtml += 'div {margin: 0; padding: 0;}';
    printHtml += '.custom-container {font-family: Arial, sans-serif;overflow: auto; width: 100%; height: auto; box-sizing: border-box; position: relative; z-index: 2;}';
    printHtml += '.table-container {width: 100%;height: auto; background-color: #fff;border: 2px solid #454545; box-sizing: border-box;}';
    printHtml += '.logo { height: 80px;margin-top:15px;margin-left:10px;}';
    printHtml += '.school-name {display: flex; align-items: center; justify-content: center; text-align: center; }';
    printHtml += '.school-name h3 { color: #0a0a0a !important; font-size: 26px !important;font-weight: bolder;margin-top:-125px !important; margin-bottom: 0 !important; }';

    printHtml += '.address{margin-top: -42px;}';
    printHtml += '.address p{font-size:18px;margin-top: -15px !important;}';
    printHtml += '.title-lable {text-align: center;margin-top: -10px;margin-bottom: 0;}';
    printHtml += '.title-lable p {color: #0a0a0a !important;font-size: 22px;font-weight: bold;letter-spacing: .5px;}';

    printHtml += '.info-table {width:100%;color: #0a0a0a !important;border: none;font-size: 18px;margin-top: -8px;margin-bottom: 6px;padding-top:8px;display: inline-table;}';
    printHtml += '.table-container .info-table th, .table-container .info-table td{color: #0a0a0a !important;text-align:left;padding-left:15px;}';
    printHtml += '.custom-table {width: 100%;color: #0a0a0a !important;border-collapse:collapse;margin-bottom: -8px;display: inline-table;border-radius:5px;}';
    printHtml += '.custom-table th{height: 32px;text-align: center;border:1px solid #454545;line-height:15px;font-size: 18px;}';
    printHtml += '.custom-table tr{height: 32px;}';
    printHtml += '.custom-table td {text-align: center;border:1px solid #454545;font-size: 18px;}';
    printHtml += '.text-bold { font-weight: bold;}';
    printHtml += '.text-left { text-align: left;}';
    printHtml += 'p {color: #0a0a0a !important;font-size:18px;}';
    printHtml += 'h4 {color: #0a0a0a !important;}';

    printHtml += '.watermark {';
    printHtml += '  position: fixed;';
    printHtml += '  top: 50%;';
    printHtml += '  left: 50%;';
    printHtml += '  transform: translate(-50%, -50%) rotate(-45deg);';
    printHtml += '  opacity: 0.1;';
    printHtml += '  z-index: 1;';
    printHtml += '  pointer-events: none;';
    printHtml += '  width: 300px;';
    printHtml += '  height: auto;';
    printHtml += '}';

    printHtml += '.watermark-container {';
    printHtml += '  position: fixed;';
    printHtml += '  top: 0;';
    printHtml += '  left: 0;';
    printHtml += '  width: 100%;';
    printHtml += '  height: 100%;';
    printHtml += '  z-index: 1000;';
    printHtml += '  pointer-events: none;';
    printHtml += '}';

    printHtml += '.watermark-logo {';
    printHtml += '  position: absolute;';
    printHtml += '  top: 25%;';
    printHtml += '  left: 50%;';
    printHtml += '  text-align: center;';
    printHtml += '  transform: translate(-50%, -50%) rotate(360deg);';
    printHtml += '  opacity: 0.19;';
    printHtml += '  width: 35%;';
    printHtml += '  height: auto;';
    printHtml += ' max-width: 500px;';
    printHtml += '}';
    printHtml += '@media print {';
    printHtml += '  .watermark, .watermark-container { -webkit-print-color-adjust: exact !important; color-adjust: exact !important; }';
    printHtml += '}';
    printHtml += '</style>';
    printHtml += '</head>';
    printHtml += '<body>';

    printHtml += '<div class="watermark-container">';
    if (schoolLogo) {
      printHtml += `<img src="${schoolLogo}" class="watermark-logo" alt="School Logo Watermark">`;
    }
    printHtml += '</div>';
    const studentElement = document.getElementById(`student`);
    if (studentElement) {
      printHtml += studentElement.outerHTML;
    }
    printHtml += '</body></html>';
    return printHtml;
  }

  closeModal() {
    this.showModal = false;
    this.showPrintModal = false;
    this.showBulkFeesModal = false;
    this.updateMode = false;
    this.errorMsg = '';
    this.payNow = false;
    this.paybleInstallment = [];
    this.paybleInstallment = [0, 0];
    this.receiptInstallment = {};
    this.receiptMode = false;
    
    // Reset loading states
    this.isClick = false;
    this.collectingStudentId = '';
    
    this.getAllStudentFeesCollectionByClass();
  }

  chooseClass(cls: number) {
    this.cls = cls;
    if (cls !== 11 && cls !== 12) {
      this.stream = this.notApplicable;
      this.studentList = [];
      this.updateRouteParams();
      this.getAllStudentFeesCollectionByClass();
    }
    if (cls == 11 || cls == 12) {
      if (this.stream == 'stream') {
        this.stream = '';
      }
      this.studentList = [];
      this.updateRouteParams();
      this.getAllStudentFeesCollectionByClass();
    }
  }

  filterStream(stream: any) {
    this.stream = stream;
    if (stream && this.cls) {
      this.studentList = [];
      this.updateRouteParams();
      this.getAllStudentFeesCollectionByClass();
    }
  }

  updateRouteParams() {
    this.router.navigate([], {
      relativeTo: this.activatedRoute,
      queryParams: { cls: this.cls || null, stream: this.stream || null },
      queryParamsHandling: 'merge'
    });
  }

  getSchool() {
    this.schoolService.getSchool(this.adminId).subscribe((res: any) => {
      if (res) {
        this.schoolInfo = res;
      }
    })
  }

  getAllStudentFeesCollectionByClass() {
    let params = {
      class: this.cls,
      adminId: this.adminId,
      stream: this.stream
    }
    this.feesService.getAllStudentFeesCollectionByClass(params).subscribe((res: any) => {
      if (res) {
        let studentFeesCollection = res.studentFeesCollection;
        let studentInfo = res.studentInfo;
        const studentMap: any = new Map(studentInfo.map((student: any) => [student._id, student]));
        const combinedData = studentFeesCollection.map((feeCollection: any) => ({
          ...studentMap.get(feeCollection.studentId),
          ...feeCollection
        }));

        this.studentList = combinedData.sort((a: any, b: any) => a.name.localeCompare(b.name));
      }
    })
  }

  feesPay(pay: boolean) {
    if (pay === false) {
      this.payNow = true;
    }
    if (pay === true) {
      this.payNow = false;
    }
  }

  studentFeesPay(student: any) {
    // Check if already collecting fees for this student
    if (this.isClick && this.collectingStudentId === student.studentId) {
      return;
    }

    this.isClick = true;
    this.collectingStudentId = student.studentId;
    
    this.getPayableSingleStudentFeesCollectionById(student);
  }

  getPayableSingleStudentFeesCollectionById(student: any) {
    this.feesService.payableSingleStudentFeesCollectionById(student.studentId).subscribe(
      (res: any) => {
        if (res) {
          this.clsFeesStructure = res.singleFeesStr;
          this.singleStudent = { ...res.studentInfo, ...res.studentFeesCollection };
          this.showModal = true;
          this.deleteMode = false;
          this.updateMode = false;
          this.feesForm.reset();
          this.errorCheck = false;
          this.errorMsg = '';
        }
        this.isClick = false;
        this.collectingStudentId = '';
      },
      (err) => {
        this.isClick = false;
        this.collectingStudentId = '';
        this.toastr.error('Error loading student fees information', 'Error');
      }
    );
  }

  // Helper method to mark all form fields as touched for validation display
  private markFormGroupTouched() {
    Object.keys(this.feesForm.controls).forEach(key => {
      const control = this.feesForm.get(key);
      control?.markAsTouched();
    });
  }

  feesAddUpdate() {
    // Check form validity first
    if (!this.feesForm.valid) {
      this.markFormGroupTouched();
      this.errorCheck = true;
      this.errorMsg = 'Please fill all required fields correctly.';
      return;
    }

    // Check if already submitting
    if (this.isClick) {
      return;
    }

    // Reset error state and set loading state
    this.errorCheck = false;
    this.errorMsg = '';
    this.isClick = true;

    this.feesForm.value.adminId = this.adminId;
    this.feesForm.value.stream = this.stream;

    if (this.updateMode) {
      // Update mode logic would go here
      console.log("Update mode is commented out");
      this.isClick = false;
    } else {
      this.feesForm.value.class = this.singleStudent.class;
      this.feesForm.value.createdBy = this.createdBy;
      this.feesForm.value.studentId = this.singleStudent.studentId;
      this.feesForm.value.session = this.singleStudent.session;

      this.feesService.addFees(this.feesForm.value).subscribe(
        (res: any) => {
          if (res) {
            this.receiptMode = true;
            this.receiptSession = res.session;
            this.receiptInstallment = res;
            
            if (res.admissionFeesPayable == true) {
              this.clsFeesStructure.feesType = [{ Admission: res.admissionFees }, ...this.clsFeesStructure.feesType];
              this.toastr.success('', 'Fee Amount Collected Successfully');
              this.showModal = false;
              this.showPrintModal = true;
            }
            if (res.admissionFeesPayable == false) {
              this.clsFeesStructure = this.clsFeesStructure;
              this.toastr.success('', 'Fee Amount Collected Successfully');
              this.showModal = false;
              this.showPrintModal = true;
            }
          }
          this.isClick = false;
        },
        (err) => {
          this.errorCheck = true;
          this.errorMsg = err.error || 'An error occurred while collecting fees.';
          this.isClick = false;
        }
      );
    }
  }
}
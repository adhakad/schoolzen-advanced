import { Component, ElementRef, ViewChild, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { AcademicSessionService } from 'src/app/services/academic-session.service';
import { StudentService } from 'src/app/services/student.service';
import { ClassService } from 'src/app/services/class.service';
import { FeesService } from 'src/app/services/fees.service';
import { FeesStructureService } from 'src/app/services/fees-structure.service';
import { PrintPdfService } from 'src/app/services/print-pdf/print-pdf.service';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { SchoolService } from 'src/app/services/school.service';
import { environment } from 'src/environments/environment';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-admission',
  templateUrl: './admission.component.html',
  styleUrls: ['./admission.component.css']
})
export class AdmissionComponent implements OnInit {
  @ViewChild('receipt') receipt!: ElementRef;
  public baseUrl = environment.API_URL;

  studentForm: FormGroup;
  showModal: boolean = false;
  showAdmissionPrintModal: boolean = false;
  showAdmissionInfoViewModal: boolean = false;
  updateMode: boolean = false;
  deleteMode: boolean = false;
  deleteById: String = '';
  errorMsg: String = '';
  errorCheck: Boolean = false;
  statusCode: Number = 0;

  academicSession!: string;
  allSession: any = [];
  classInfo: any[] = [];
  studentInfo: any[] = [];
  recordLimit: number = 10;
  filters: any = {};
  number: number = 0;
  paginationValues: Subject<any> = new Subject();
  page: Number = 0;

  // Add submission state management properties
  isClick: boolean = false;

  sessions: any;
  categorys: any;
  religions: any;
  qualifications: any;
  occupations: any;
  stream: string = '';
  mediums: any;
  streamMainSubject: any[] = ['mathematics(science)', 'biology(science)', 'history(arts)', 'sociology(arts)', 'political science(arts)', 'accountancy(commerce)', 'economics(commerce)', 'agriculture', 'home science'];
  cls: number = 0;
  clsFeesStructure: any;
  schoolInfo: any;
  admissionrReceiptInfo: any;
  singleAdmissionInfo: any;
  receiptMode: boolean = false;
  studentFeesCollection: any;
  baseURL!: string;
  loader: Boolean = true;
  adminId!: String;
  logoPreview: any = null;
  serialNo!: number;

  constructor(
    private fb: FormBuilder,
    private toastr: ToastrService,
    private adminAuthService: AdminAuthService,
    private academicSessionService: AcademicSessionService,
    private schoolService: SchoolService,
    private printPdfService: PrintPdfService,
    private classService: ClassService,
    private studentService: StudentService,
    private feesStructureService: FeesStructureService,
    private feesService: FeesService,
  ) {
    this.studentForm = this.fb.group({
      _id: [''],
      adminId: [''],
      session: ['', Validators.required],
      medium: ['', Validators.required],
      admissionNo: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
      admissionFees: ['', Validators.required],
      rollNumber: ['', [Validators.required, Validators.maxLength(8), Validators.pattern('^[0-9]+$')]],
      class: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
      admissionClass: [''],
      stream: ['', Validators.required],
      name: ['', [Validators.required, Validators.pattern('^[a-zA-Z\\s]+$')]],
      studentImage: [''], // Add student image field
      dob: ['', Validators.required],
      doa: [''],
      aadharNumber: ['', [Validators.pattern('^\\d{12}$')]],
      samagraId: ['', [Validators.pattern('^\\d{9}$')]],
      udiseNumber: ['', [Validators.pattern('^\\d{11}$')]],
      bankAccountNo: ['', [Validators.minLength(9), Validators.maxLength(18), Validators.pattern('^[0-9]+$')]],
      bankIfscCode: ['', [Validators.minLength(11), Validators.maxLength(11)]],
      gender: ['', Validators.required],
      category: ['', Validators.required],
      religion: ['', Validators.required],
      nationality: ['', Validators.required],
      address: ['', [Validators.required, Validators.maxLength(50)]],
      lastSchool: ['', [Validators.maxLength(50)]],
      fatherName: ['', [Validators.required, Validators.pattern('^[a-zA-Z\\s]+$')]],
      fatherQualification: ['', [Validators.required, Validators.pattern('^[a-zA-Z\\s]+$')]],
      fatherOccupation: ['', Validators.required],
      motherName: ['', [Validators.required, Validators.pattern('^[a-zA-Z\\s]+$')]],
      motherQualification: ['', Validators.required],
      motherOccupation: ['', Validators.required],
      parentsContact: ['', [Validators.pattern('^[6789]\\d{9}$')]],
      familyAnnualIncome: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
      feesConcession: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
      createdBy: [''],
    })
  }

  ngOnInit(): void {
    this.setAdminInfo();
    this.getSchool(this.adminId);
    this.getClass();
    this.getAcademicSession();
    let load: any = this.getStudentsByAdmission({ page: 1 });
    this.allOptions();
    if (load) {
      setTimeout(() => {
        this.loader = false;
      }, 1000);
    }
    var currentURL = window.location.href;
    this.baseURL = new URL(currentURL).origin;
  }

  // Add this method to properly set admin info
  setAdminInfo() {
    const getAdmin = this.adminAuthService.getLoggedInAdminInfo();
    if (getAdmin?.id) {
      this.adminId = getAdmin.id;
    }
  }

  getAcademicSession() {
    this.academicSessionService.getAcademicSession().subscribe((res: any) => {
      if (res) {
        this.academicSession = res.academicSession;
      }
    })
  }

  printStudentData() {
    const printContent = this.getPrintContent();
    this.printPdfService.printContent(printContent);
    this.closeModal();
  }

  private getPrintContent(): string {
    let schoolLogo = this.schoolInfo.schoolLogo;
    let printHtml = '<html>';
    printHtml += '<head>';
    printHtml += '<style>';
    printHtml += '@page { size: A3; margin: 10mm; }';
    printHtml += 'body {width: 100%; height: 100%; margin: 0; padding: 0; }';
    printHtml += 'div {margin: 0; padding: 0;}';
    printHtml += '.custom-container {font-family: Arial, sans-serif;overflow: auto; width: 100%; height: auto; box-sizing: border-box;}';
    printHtml += '.table-container {width: 100%;height: auto; background-color: #fff;border: 2px solid #707070; box-sizing: border-box;}';
    printHtml += '.logo { height: 95px;margin-top:15px;margin-left:10px;}';
    printHtml += '.school-name {display: flex; align-items: center; justify-content: center; text-align: center; }';
    printHtml += '.school-name h3 { color: #0a0a0a !important; font-size: 26px !important;font-weight: bolder;margin-top:-140px !important; margin-bottom: 0 !important; }';

    printHtml += '.address{margin-top: -45px;}';
    printHtml += '.address p{color: #0a0a0a !important;font-size:18px;margin-top: -15px !important;}';
    printHtml += '.title-lable {text-align: center;margin-top: 0px;margin-bottom: 0;}';
    printHtml += '.title-lable p {color: #0a0a0a !important;font-size: 22px;font-weight: bold;letter-spacing: .5px;}';

    printHtml += '.info-table {width:100%;color: #0a0a0a !important;border: none;font-size: 18px;margin-top: 1.20vh;margin-bottom: 1vh;display: inline-table;}';
    printHtml += '.table-container .info-table th, .table-container .info-table td{color: #0a0a0a !important;text-align:left;padding-left:15px;padding-top:5px;padding-bottom:5px;}';

    printHtml += '.custom-table {width: 100%;color: #0a0a0a !important;border-collapse:collapse;margin-bottom: 20px;display: inline-table;border-radius:5px}';
    printHtml += '.custom-table th{min-height: 48px;text-align: center;border:1px solid #707070;line-height:25px;font-size: 18px;}';
    printHtml += '.custom-table tr{height: 48px;}';
    printHtml += '.custom-table td {text-align: center;border:1px solid #707070;font-size: 18px;}';
    printHtml += '.text-bold { font-weight: bold;}';
    printHtml += '.text-left { text-align: left;}';
    printHtml += 'p {color: #0a0a0a !important;font-size:19px;}'
    printHtml += 'h4 {color: #0a0a0a !important;}'

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
    printHtml += '  top: 45%;';
    printHtml += '  left: 50%;';
    printHtml += '  text-align: center;';
    printHtml += '  transform: translate(-50%, -50%) rotate(360deg);';
    printHtml += '  opacity: 0.19;';
    printHtml += '  width: 45%;';
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

  getSchool(adminId: any) {
    this.schoolService.getSchool(adminId).subscribe((res: any) => {
      if (res) {
        this.schoolInfo = res;
      }
    })
  }

  addPrintModal(student: any) {
    let params = {
      adminId: this.adminId,
      studentId: student._id,
    }
    this.showAdmissionPrintModal = true;
    this.feesService.singleStudentFeesCollectionById(params).subscribe((res: any) => {
      if (res) {
        this.singleAdmissionInfo = student;
        this.singleAdmissionInfo.admissionFees = res.studentFeesCollection.admissionFees;
      }
    })
  }

  addAdmissionInfoViewModel(admission: any) {
    this.showAdmissionInfoViewModal = true;
    this.singleAdmissionInfo = admission;
  }

  chooseClass(cls: any) {
    this.errorCheck = false;
    this.errorMsg = '';
    this.cls = 0;
    this.clsFeesStructure = {};
    this.cls = cls;
    if (cls < 11 && cls !== 0 || cls == 200 || cls == 201 || cls == 202) {
      this.studentForm.get('stream')?.setValue("n/a");
      this.stream = '';
      this.stream = 'stream';
      if (this.stream) {
        this.feesStructureByClassStream();
      }
    }
  }

  chooseStream(stream: any) {
    this.stream = '';
    this.stream = stream;
    if (this.stream) {
      this.feesStructureByClassStream();
    }
  }

  feesStructureByClassStream() {
    let params = {
      class: this.cls,
      adminId: this.adminId,
      stream: this.stream
    }
    this.feesStructureService.feesStructureByClassStream(params).subscribe((res: any) => {
      if (res) {
        this.errorCheck = false;
        this.errorMsg = '';
        res.feesType = [{ Admission: res.admissionFees }, ...res.feesType];
        this.clsFeesStructure = res;
        const admissionFees = this.clsFeesStructure?.admissionFees;
        this.studentForm.get('admissionFees')?.setValue(admissionFees);
      }
    }, err => {
      this.errorCheck = true;
      this.errorMsg = err.error;
      this.studentForm.get('admissionFees')?.setValue('');
    })
  }

  date(e: any) {
    var convertDate = new Date(e.target.value).toISOString().substring(0, 10);
    this.studentForm.get('dob')?.setValue(convertDate, {
      onlyself: true,
    });
  }

  closeModal() {
    this.showModal = false;
    this.showAdmissionPrintModal = false;
    this.showAdmissionInfoViewModal = false;
    this.updateMode = false;
    this.deleteMode = false;
    this.errorMsg = '';
    this.stream = '';
    this.cls = 0;
    this.receiptMode = false;
    this.admissionrReceiptInfo = null;
    this.singleAdmissionInfo = null;
    this.logoPreview = null;
    this.studentForm.reset();
    // Reset all submission states
    this.isClick = false;
  }

  addStudentModel() {
    this.showModal = true;
    this.deleteMode = false;
    this.updateMode = false;
    this.errorCheck = false;
    this.errorMsg = '';
    this.isClick = false;

    // Reset form completely
    this.studentForm.reset();
    this.logoPreview = null;

    this.studentForm.get('session')?.setValue(this.academicSession);

    if (this.adminId) {
      this.studentForm.get('adminId')?.setValue(this.adminId);
    } else {
      this.setAdminInfo();
      if (this.adminId) {
        this.studentForm.get('adminId')?.setValue(this.adminId);
      }
    }

    // Ensure all form controls are enabled
    Object.keys(this.studentForm.controls).forEach(key => {
      this.studentForm.get(key)?.enable();
    });

    // Reset validation state
    this.studentForm.markAsUntouched();
    this.studentForm.updateValueAndValidity();
  }

  getClass() {
    this.classService.getClassList().subscribe((res: any) => {
      if (res) {
        this.classInfo = res;
      }
    })
  }

  successDone(msg: any) {
    this.closeModal();
    this.getStudentsByAdmission({ page: this.page });
    setTimeout(() => {
      this.toastr.success('', msg);
    }, 500)
  }

  getStudentsByAdmission($event: any) {
    this.page = $event.page
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

      this.studentService.studentPaginationByAdmission(params).subscribe((res: any) => {
        if (res) {
          this.errorCheck = false;
          this.statusCode = 200;
          this.studentInfo = res.studentList;
          this.serialNo = res.serialNo;
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

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.studentForm.patchValue({ studentImage: file });

      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.logoPreview = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }

  // Helper method to mark all form fields as touched for validation display
  private markFormGroupTouched() {
    Object.keys(this.studentForm.controls).forEach(key => {
      const control = this.studentForm.get(key);
      control?.markAsTouched();
    });
  }

  studentAddUpdate() {
    // Check form validity first
    if (!this.studentForm.valid) {
      // Mark all fields as touched to show validation errors
      this.markFormGroupTouched();
      this.errorCheck = true;
      this.errorMsg = 'Please fill all required fields correctly.';
      return;
    }

    // Check if already submitting
    if (this.isClick) {
      return;
    }

    // Reset error state
    this.errorCheck = false;
    this.errorMsg = '';
    this.isClick = true;

    if (!this.adminId) {
      this.setAdminInfo();
    }

    if (!this.adminId) {
      this.errorCheck = true;
      this.errorMsg = 'Admin information not available. Please refresh and try again.';
      this.isClick = false;
      return;
    }

    // Create a copy of form values to avoid modifying the actual form
    const formValues = { ...this.studentForm.value };

    formValues.adminId = this.adminId;
    formValues.admissionType = 'new';
    formValues.createdBy = 'Admin';
    formValues.familyAnnualIncome = String(formValues.familyAnnualIncome);
    formValues.doa = 'any';
    const dob = new Date(formValues.dob);
    const formattedDob = `${String(dob.getDate()).padStart(2, '0')}/${String(dob.getMonth() + 1).padStart(2, '0')}/${dob.getFullYear()}`;
    formValues.dob = formattedDob;
    formValues.admissionClass = Number(200);
    this.studentService.addStudent(formValues).subscribe((res: any) => {
      if (res) {
        this.isClick = false;
        this.successDone(res);
      }
    }, err => {
      this.errorCheck = true;
      this.errorMsg = err.error || 'An error occurred while adding admission.';
      this.isClick = false;
    })
  }

  allOptions() {
    this.sessions = [{ year: '2023-2024' }, { year: '2024-2025' }, { year: '2025-2026' }, { year: '2026-2027' }, { year: '2027-2028' }, { year: '2028-2029' }, { year: '2029-2030' }];
    this.categorys = [{ category: 'general' }, { category: 'obc' }, { category: 'sc' }, { category: 'st' }, { category: 'ews' }, { category: 'other' }];
    this.religions = [{ religion: 'hindu' }, { religion: 'buddhist' }, { religion: 'christian' }, { religion: 'jain' }, { religion: 'sikh' }, { religion: 'animist' }, { religion: 'muslim' }, { religion: 'bahai' }, { religion: 'jewish' }, { religion: 'zoroastrian' }, { religion: 'other' }];
    this.qualifications = [{ qualification: 'doctoral degree' }, { qualification: 'masters degree' }, { qualification: 'graduate diploma' }, { qualification: 'graduate certificate' }, { qualification: 'graduate certificate' }, { qualification: 'bachelor degree' }, { qualification: 'advanced diploma' }, { qualification: 'primary school' }, { qualification: 'high school' }, { qualification: 'higher secondary school' }, { qualification: 'illiterate' }, { qualification: 'other' }];
    this.occupations = [{ occupation: 'agriculture(farmer)' }, { occupation: 'labourer' }, { occupation: 'self employed' }, { occupation: 'private job' }, { occupation: 'state govt. employee' }, { occupation: 'central govt. employee' }, { occupation: 'military job' }, { occupation: 'para-military job' }, { occupation: 'psu employee' }, { occupation: 'other' }];
    this.mediums = [{ medium: 'hindi' }, { medium: 'english' }];
  }
}
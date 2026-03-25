import { Component, ElementRef, ViewChild, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
// import { read, utils, writeFile } from 'xlsx';
import * as ExcelJS from 'exceljs';
import { Subject } from 'rxjs';
import { AcademicSessionService } from 'src/app/services/academic-session.service';
import { StudentService } from 'src/app/services/student.service';
import { ClassService } from 'src/app/services/class.service';
import { MatRadioChange } from '@angular/material/radio';
import { ExcelService } from 'src/app/services/excel/excel.service';
import { SchoolService } from 'src/app/services/school.service';
import { HttpClient } from '@angular/common/http';
import { PrintPdfService } from 'src/app/services/print-pdf/print-pdf.service';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ClassSubjectService } from 'src/app/services/class-subject.service';
import { environment } from 'src/environments/environment';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-student',
  templateUrl: './student.component.html',
  styleUrls: ['./student.component.css']
})
export class StudentComponent implements OnInit {
  @ViewChild('content') content!: ElementRef;
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  public baseUrl = environment.API_URL;
  studentForm: FormGroup;
  excelForm: FormGroup;
  showModal: boolean = false;
  showBulkImportModal: boolean = false;
  showBulkExportModal: boolean = false;
  showStudentInfoViewModal: boolean = false;
  updateMode: boolean = false;
  deleteMode: boolean = false;
  deleteById: String = '';
  successMsg: String = '';
  errorMsg: String = '';
  errorCheck: Boolean = false;
  statusCode: Number = 0;
  academicSession!: string;
  classInfo: any[] = [];
  studentInfo: any[] = [];
  studentInfoByClass: any[] = [];
  recordLimit: number = 10;
  filters: any = {};
  number: number = 0;
  paginationValues: Subject<any> = new Subject();
  page: Number = 0;
  selectedValue: number = 0;

  // Add submission state management properties
  isClick: boolean = false;

  sessions: any;
  categorys: any;
  religions: any;
  qualifications: any;
  occupations: any;
  mediums: any;
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
  singleStudentInfo: any
  singleStudentTCInfo: any
  classSubject: any[] = [];
  serialNo!: number;
  isDate: string = '';
  baseURL!: string;
  adminId!: String
  selectedSession: string = '';
  classMap: any = {
    200: 'Nursery',
    201: 'LKG',
    202: 'UKG',
    1: '1st',
    2: '2nd',
    3: '3rd',
    4: '4th',
    5: '5th',
    6: '6th',
    7: '7th',
    8: '8th',
    9: '9th',
    10: '10th',
    11: '11th',
    12: '12th'
  };
  logoPreview: any = null;  // For showing school logo preview

  constructor(private fb: FormBuilder, public activatedRoute: ActivatedRoute, private toastr: ToastrService, private academicSessionService: AcademicSessionService, private printPdfService: PrintPdfService, private schoolService: SchoolService, public ete: ExcelService, private adminAuthService: AdminAuthService, private classService: ClassService, private classSubjectService: ClassSubjectService, private studentService: StudentService) {
    this.studentForm = this.fb.group({
      _id: [''],
      session: ['', Validators.required],
      medium: ['', Validators.required],
      adminId: [''],
      admissionNo: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
      admissionType: [''],
      class: [''],
      admissionClass: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
      stream: [''],
      rollNumber: ['', [Validators.required, Validators.maxLength(8), Validators.pattern('^[0-9]+$')]],
      name: ['', [Validators.required, Validators.pattern('^[a-zA-Z\\s]+$')]],
      studentImage: [''], // School logo file
      dob: ['', Validators.required],
      doa: ['', Validators.required],
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

    this.excelForm = this.fb.group({
      excelData: [null],
    });
  }

  ngOnInit(): void {
    this.setAdminInfo();
    this.getSchool();
    this.getAcademicSession();
    this.getClass();
    this.allOptions();
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
        this.selectedSession = res.academicSession;
      }
    })
  }

  filterSession(selectedSession: any) {
    this.errorCheck = false;
    this.errorMsg = '';
    this.selectedSession = selectedSession;
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

  date(e: any) {
    var convertDate = new Date(e.target.value).toISOString().substring(0, 10);
    this.studentForm.get('dob')?.setValue(convertDate, {
      onlyself: true,
    });
  }

  onChange(event: MatRadioChange) {
    this.selectedValue = event.value;
  }

  closeModal() {
    this.showModal = false;
    this.showBulkImportModal = false;
    this.showBulkExportModal = false;
    this.showStudentInfoViewModal = false;
    this.updateMode = false;
    this.deleteMode = false;
    this.fileChoose = false;
    this.errorCheck = false;
    this.errorMsg = '';
    this.successMsg = '';
    this.classSubject = [];
    this.promotedClass = undefined;
    this.singleStudentInfo = undefined;
    this.singleStudentTCInfo = undefined;
    this.admissionType = '';
    this.resetFileInput();
    this.studentForm.reset();
    this.excelForm.reset();
    this.logoPreview = null;
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

    // Set default values
    this.classStreamFormValueSet();
    this.studentForm.get('session')?.setValue(this.academicSession);

    if (this.adminId) {
      this.studentForm.get('adminId')?.setValue(this.adminId);
    } else {
      // Try to get admin info again
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

  classStreamFormValueSet() {
    let cls = '';
    if (this.className == 1) {
      cls = `${this.className}st`;
    }
    if (this.className == 2) {
      cls = `${this.className}nd`;
    }
    if (this.className == 3) {
      cls = `${this.className}rd`;
    }
    if (this.className >= 4 && this.className <= 12) {
      cls = `${this.className}th`;
    }
    if (this.className == 200) {
      cls = `Nursery`;
    }
    if (this.className == 201) {
      cls = `LKG`;
    }
    if (this.className == 202) {
      cls = `UKG`;
    }
    this.studentForm.get('class')?.setValue(cls);
    if (this.cls < 11 && this.cls !== 0 || this.cls == 200 || this.cls == 201 || this.cls == 202) {
      this.studentForm.get('stream')?.setValue("n/a");
    }
    if (this.cls == 12 || this.cls == 11) {
      this.studentForm.get('stream')?.setValue(this.stream);
    }
  }

  addBulkStudentImportModel() {
    this.showBulkImportModal = true;
    this.errorCheck = false;
    this.errorMsg = '';
    this.isClick = false;
  }

  addBulkStudentExportModel() {
    this.showBulkExportModal = true;
    this.errorCheck = false;
    this.errorMsg = '';
    this.isClick = false;
    this.getStudentByClass(this.className);
  }

  addStudentInfoViewModel(student: any) {
    this.showStudentInfoViewModal = true;
    this.singleStudentInfo = student;
  }

  updateStudentModel(student: any) {
    this.showModal = true;
    this.deleteMode = false;
    this.updateMode = true;
    this.errorCheck = false;
    this.errorMsg = '';
    this.isClick = false;

    const dobArray = student.dob.split('/');
    const doaArray = student.doa.split('/');

    const dobISO = new Date(`${dobArray[2]}/${dobArray[1]}/${dobArray[0]}`);
    const doaISO = new Date(`${doaArray[2]}/${doaArray[1]}/${doaArray[0]}`);

    // First ensure all controls are enabled
    Object.keys(this.studentForm.controls).forEach(key => {
      this.studentForm.get(key)?.enable();
    });

    // Patch the form with the student data
    this.studentForm.patchValue({
      _id: student._id,
      session: student.session,
      medium: student.medium,
      adminId: student.adminId,
      admissionNo: student.admissionNo,
      admissionType: student.admissionType,
      class: student.class,
      admissionClass: student.admissionClass,
      stream: student.stream,
      rollNumber: student.rollNumber,
      name: student.name,
      dob: dobISO,
      doa: doaISO,
      aadharNumber: student.aadharNumber,
      samagraId: student.samagraId,
      udiseNumber: student.udiseNumber,
      bankAccountNo: student.bankAccountNo,
      bankIfscCode: student.bankIfscCode,
      gender: student.gender,
      category: student.category,
      religion: student.religion,
      nationality: student.nationality,
      address: student.address,
      lastSchool: student.lastSchool,
      fatherName: student.fatherName,
      fatherQualification: student.fatherQualification,
      fatherOccupation: student.fatherOccupation,
      motherName: student.motherName,
      motherQualification: student.motherQualification,
      motherOccupation: student.motherOccupation,
      parentsContact: student.parentsContact,
      familyAnnualIncome: student.familyAnnualIncome,
      feesConcession: student.feesConcession,
      createdBy: student.createdBy
    });

    // Handle class mapping if needed
    const classValue = student.class;
    if (classValue && this.classMap[classValue]) {
      this.studentForm.patchValue({
        class: this.classMap[classValue]
      });
    }

    // Reset form validation state after patching values
    this.studentForm.markAsUntouched();
    this.studentForm.updateValueAndValidity();

    if (student.studentImage) {
      this.logoPreview = `${this.baseUrl}/${student.studentImage}`;
    }
  }

  deleteStudentModel(id: String) {
    this.showModal = true;
    this.updateMode = false;
    this.deleteMode = true;
    this.deleteById = id;
    this.errorCheck = false;
    this.errorMsg = '';
    this.isClick = false;
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

  successDone(msg: any) {
    this.closeModal();
    this.successMsg = '';
    this.getStudents({ page: this.page });
    setTimeout(() => {
      this.toastr.success('', msg);
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
    formValues.createdBy = 'Admin';
    formValues.class = this.className;
    formValues.familyAnnualIncome = String(formValues.familyAnnualIncome);

    // Format dates without modifying form controls
    const dob = new Date(formValues.dob);
    const formattedDob = `${String(dob.getDate()).padStart(2, '0')}/${String(dob.getMonth() + 1).padStart(2, '0')}/${dob.getFullYear()}`;

    const doa = new Date(formValues.doa);
    const formattedDoa = `${String(doa.getDate()).padStart(2, '0')}/${String(doa.getMonth() + 1).padStart(2, '0')}/${doa.getFullYear()}`;

    formValues.dob = formattedDob;
    formValues.doa = formattedDoa;

    if (this.updateMode) {
      this.studentService.updateStudent(formValues).subscribe((res: any) => {
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
      formValues.admissionType = 'old';
      this.studentService.addStudent(formValues).subscribe((res: any) => {
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

  changeStatus(id: any, statusValue: any) {
    if (id) {
      let params = {
        id: id,
        statusValue: statusValue,
      }
      this.studentService.changeStatus(params).subscribe((res: any) => {
        if (res) {
          this.getStudents({ page: this.page });
        }
      })
    }
  }

  studentDelete(id: String) {
    if (this.isClick) {
      return;
    }
    // Reset error state
    this.errorCheck = false;
    this.errorMsg = '';
    this.isClick = true;
    this.studentService.deleteStudent(id).subscribe((res: any) => {
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

  handleImport(event: any): void {
    const file = event.target.files[0];
    if (!file) return;

    const fileReader = new FileReader();
    fileReader.onload = (e: any) => {
      const arrayBuffer = e.target.result;
      this.parseExcel(arrayBuffer);
    };
    fileReader.readAsArrayBuffer(file);
  }

  resetFileInput(): void {
    if (this.fileInput && this.fileInput.nativeElement) {
      this.fileInput.nativeElement.value = '';
    }
  }

  parseExcel(arrayBuffer: any): void {
    const workbook = new ExcelJS.Workbook();
    workbook.xlsx.load(arrayBuffer).then((workbook) => {
      const worksheet = workbook.getWorksheet(1);
      const data: any = [];
      const rowNumbers: number[] = []; // Track actual Excel row numbers

      worksheet!.eachRow({ includeEmpty: false }, (row: any, rowNumber) => {
        // Assuming the first row contains headers
        if (rowNumber === 1) {
          const headers = row.values.map(String);
          data.push(headers);
          rowNumbers.push(rowNumber);
        } else {
          const rowData = row.values.map(String);
          data.push(rowData);
          rowNumbers.push(rowNumber); // Store actual Excel row number
        }
      });

      const lastIndex = data.length - 0;
      const indexesToDelete = [0, lastIndex];
      // IndexesToDelete ke hisab se elements ko delete karna
      indexesToDelete.sort((a, b) => b - a); // Sort indexesToDelete in descending order
      indexesToDelete.forEach((index) => {
        data.splice(index, 1);
        rowNumbers.splice(index, 1); // Also delete from rowNumbers array
      });

      const fields = data[0];
      // Data ke baki ke rows
      const dataRows = data.slice(1);
      const dataRowNumbers = rowNumbers.slice(1); // Row numbers after header

      const formatDateValue = (value: any): string => {
        if (value instanceof Date && !isNaN(value.getTime())) {
          const day = String(value.getDate()).padStart(2, '0');
          const month = String(value.getMonth() + 1).padStart(2, '0');
          const year = value.getFullYear();
          return `${day}/${month}/${year}`;
        }

        if (typeof value === 'string') {
          if (value.includes('GMT')) {
            const dateObj = new Date(value);
            if (!isNaN(dateObj.getTime())) {
              const day = String(dateObj.getDate()).padStart(2, '0');
              const month = String(dateObj.getMonth() + 1).padStart(2, '0');
              const year = dateObj.getFullYear();
              return `${month}/${day}/${year}`;
            }
          }

          if (value.includes('/')) {
            const [d, m, y] = value.split('/');
            if (d && m && y) {
              const day = d.padStart(2, '0');
              const month = m.padStart(2, '0');
              return `${day}/${month}/${y}`;
            }
          }
        }

        return value;
      };

      const mappedData = dataRows.map((row: any, index: number) => {
        const obj: any = {};

        // Store actual Excel row number in the object
        obj._excelRowNumber = dataRowNumbers[index];

        for (let i = 0; i < fields.length; i++) {
          const field = fields[i];
          let value = row[i];

          if (field === 'Dob' || field === 'Doa') {
            value = formatDateValue(value);
          }

          obj[field] = value;
        }

        return obj;
      });

      function transformKeys(dataArray: any) {
        return dataArray.map((obj: any) => {
          const newObj: any = {};
          for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
              if (key === '_excelRowNumber') {
                // Keep the Excel row number as-is
                newObj[key] = obj[key];
              } else {
                const newKey = key.replace(/\s+/g, ''); // Remove spaces
                newObj[newKey.charAt(0).toLowerCase() + newKey.slice(1)] = obj[key];
              }
            }
          }
          return newObj;
        });
      }

      // Transform the keys of the array
      const transformedDataArray = transformKeys(mappedData);

      if (transformedDataArray.length > 200) {
        this.fileChoose = false;
        this.errorCheck = true;
        this.errorMsg = 'File too large, Please make sure that file records to less then or equals to 200!';
      }
      if (transformedDataArray.length <= 200) {
        this.bulkStudentRecord = transformedDataArray;
        this.fileChoose = true;
        this.errorCheck = false;
        this.errorMsg = '';
      }
    }).catch(err => {
      this.errorCheck = true;
      this.errorMsg = 'Error parsing Excel file. Please check the file format!';
    });
  }

  addBulkStudentRecord() {
    // 1. Initial Checks and State Reset
    if (this.isClick || !this.fileChoose) return;

    this.isClick = true;
    this.errorCheck = false;
    this.errorMsg = '';

    // --- Constants & Configs ---
    const validGenders = new Set(['male', 'female', 'other']);
    const validCategories = new Set(['general', 'obc', 'sc', 'st', 'ews', 'other']);
    const validMediums = new Set(['hindi', 'english']);
    const validAdmissionTypes = new Set(['new', 'old']);
    const validClasses = new Set([
      'nursery', 'lkg', 'ukg',
      '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'
    ]);

    // Numeric Fields (Must be numbers)
    const numericFields = [
      'admissionNo', 'rollNumber', 'udiseNumber',
      'bankAccountNo', 'feesConcession', 'familyAnnualIncome'
    ];

    // ID Fields (Must be Numeric + Specific Length checks later)
    const idFields = ['aadharNumber', 'samagraId', 'parentsContact'];

    // Name Fields (Must be alphabetic with spaces, hyphens, apostrophes only)
    const nameFields = ['name', 'fatherName', 'motherName'];

    // String Fields
    const stringFields = [
      'session', 'medium', 'admissionType',
      'gender', 'category', 'religion', 'nationality', 'address',
      'fatherQualification', 'fatherOccupation',
      'motherQualification', 'motherOccupation',
      'bankIfscCode', 'lastSchool'
    ];

    // Date Fields (Format: DD/MM/YYYY)
    const dateFields = ['dob', 'doa'];

    // Required Fields
    const requiredFields = [
      'medium', 'name', 'fatherName', 'motherName',
      'admissionNo', 'feesConcession', 'admissionType',
      'admissionClass', 'dob', 'doa', 'gender', 'category'
    ];

    // --- Helper Functions ---

    const toTitleCase = (str: string): string => {
      if (!str) return '';
      return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
    };

    const isValidClass = (classValue: any): boolean => {
      if (!classValue) return false;
      return validClasses.has(String(classValue).toLowerCase().trim());
    };

    // Helper: Validate Name (Only alphabets, spaces, hyphens, apostrophes)
    const isValidName = (name: string): boolean => {
      if (!name || typeof name !== 'string') return false;
      // Allow alphabets (including Unicode for Indian names), spaces, hyphens, apostrophes, dots
      const nameRegex = /^[a-zA-Z\u0900-\u097F\s.\-']+$/;
      return nameRegex.test(name.trim());
    };

    // Helper: Validate Date Format (DD/MM/YYYY)
    const isValidDate = (dateStr: string): boolean => {
      // Regex for DD/MM/YYYY or DD-MM-YYYY
      const regex = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/;
      if (!regex.test(dateStr)) return false;

      const parts = dateStr.match(regex);
      if (!parts) return false;

      const day = parseInt(parts[1], 10);
      const month = parseInt(parts[2], 10);
      const year = parseInt(parts[3], 10);

      // Basic range checks
      if (year < 1900 || year > 2100) return false;
      if (month == 0 || month > 12) return false;

      // Check days in month
      const monthLength = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      // Leap year adjustment
      if (year % 400 == 0 || (year % 100 != 0 && year % 4 == 0)) monthLength[1] = 29;

      return day > 0 && day <= monthLength[month - 1];
    };

    // 2. Initial File Size Check
    if (!this.bulkStudentRecord || this.bulkStudentRecord.length === 0) {
      this.errorCheck = true;
      this.errorMsg = 'No student records provided!';
      this.isClick = false;
      return;
    }

    if (this.bulkStudentRecord.length > 200) {
      this.errorCheck = true;
      this.errorMsg = 'File too large. Maximum 200 records allowed!';
      this.isClick = false;
      return;
    }

    // Batch Uniqueness Trackers
    const batchAdmissionNos = new Set<number>();
    const batchAadharNumbers = new Set<any>(); // Aadhar can be huge number, treat safely
    const batchRollNumbers = new Set<number>();

    // 3. Main Validation Loop
    try {
      for (let i = 0; i < this.bulkStudentRecord.length; i++) {
        const student = { ...this.bulkStudentRecord[i] };
        const rowNumber = student._excelRowNumber || (i + 3);

        // --- A. Required Field Check ---
        const missingFields = requiredFields.filter(field => {
          const value = student[field];
          return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
        });

        if (missingFields.length > 0) {
          throw new Error(
            `Row ${rowNumber}: Missing mandatory fields: (${missingFields.map(toTitleCase).join(', ')}).`
          );
        }

        // --- B. Validate Name Fields (Only alphabetic characters) ---
        for (const field of nameFields) {
          if (student[field]) {
            const nameValue = String(student[field]).trim();
            if (!isValidName(nameValue)) {
              throw new Error(
                `Row ${rowNumber}: ${toTitleCase(field)} must contain only letters, spaces, hyphens, or apostrophes. Found: "${student[field]}"`
              );
            }
          }
        }

        // --- C. Validate Medium ---
        if (!validMediums.has(String(student.medium).toLowerCase().trim())) {
          throw new Error(
            `Row ${rowNumber}: Invalid Medium "${student.medium}". Allowed: Hindi, English.`
          );
        }

        // --- D. Validate Admission Type ---
        if (!validAdmissionTypes.has(String(student.admissionType).toLowerCase().trim())) {
          throw new Error(
            `Row ${rowNumber}: Invalid Admission Type "${student.admissionType}". Allowed: New, Old.`
          );
        }

        // --- E. Validate Admission Class ---
        if (!isValidClass(student.admissionClass)) {
          throw new Error(
            `Row ${rowNumber}: Invalid Admission Class "${student.admissionClass}". Allowed: Nursery, LKG, UKG, 1-12.`
          );
        }

        // --- F. Validate Numeric Fields (General) ---
        [...numericFields, ...idFields].forEach(field => {
          let value = student[field];
          // Only validate if value exists
          if (value !== null && value !== undefined && value !== '') {
            // Remove spaces if string representation
            if (typeof value === 'string') value = value.trim();

            if (isNaN(Number(value))) {
              throw new Error(`Row ${rowNumber}: ${toTitleCase(field)} must be a valid number. Found: "${student[field]}"`);
            }
            // Convert to proper number type in data
            student[field] = Number(value);
          }
        });

        // --- G. STRICT Special Data Type Validations ---

        // 1. Mobile Number (Parents Contact)
        if (student.parentsContact) {
          const contactStr = String(student.parentsContact);
          if (contactStr.length !== 10) {
            throw new Error(`Row ${rowNumber}: Parents Contact must be exactly 10 digits. Found: ${contactStr}`);
          }
        }

        // 2. Aadhar Number (12 digits) - Optional field but strict if present
        if (student.aadharNumber) {
          const aadharStr = String(student.aadharNumber);
          if (aadharStr.length !== 12) {
            throw new Error(`Row ${rowNumber}: Aadhar Number must be exactly 12 digits. Found length: ${aadharStr.length}`);
          }
        }

        // 3. Samagra ID (9 digits typically) - Optional field but strict if present
        if (student.samagraId) {
          const samagraStr = String(student.samagraId);
          // Samagra is usually 9 digits, verify your local requirement
          if (samagraStr.length !== 9) {
            throw new Error(`Row ${rowNumber}: Samagra ID must be 9 digits. Found: ${samagraStr}`);
          }
        }

        // 4. Date Validations (DOB & DOA)
        for (const dateField of dateFields) {
          if (student[dateField]) {
            if (!isValidDate(String(student[dateField]))) {
              throw new Error(`Row ${rowNumber}: Invalid ${toTitleCase(dateField)} format. Use DD/MM/YYYY. Found: "${student[dateField]}"`);
            }
          }
        }

        // --- H. String Type Validation ---
        for (const field of stringFields) {
          if (student[field] && typeof student[field] !== 'string' && typeof student[field] !== 'number') {
            throw new Error(`Row ${rowNumber}: ${toTitleCase(field)} must be text.`);
          }
        }

        // --- I. Logic & Content Validation ---

        // Gender
        if (!validGenders.has(String(student.gender).toLowerCase().trim())) {
          throw new Error(`Row ${rowNumber}: Invalid Gender "${student.gender}". Allowed: Male, Female, Other.`);
        }

        // Category
        if (!validCategories.has(String(student.category).toLowerCase().trim())) {
          throw new Error(`Row ${rowNumber}: Invalid Category "${student.category}". Allowed: General, OBC, SC, ST, EWS, Other.`);
        }

        // Fees Negative Check
        if (student.feesConcession < 0) {
          throw new Error(`Row ${rowNumber}: Fees Concession cannot be negative.`);
        }

        // --- J. Uniqueness Checks (Current Batch) ---
        if (batchAdmissionNos.has(student.admissionNo)) {
          throw new Error(`Row ${rowNumber}: Duplicate Admission No (${student.admissionNo}) in this file.`);
        }
        if (student.rollNumber && batchRollNumbers.has(student.rollNumber)) {
          throw new Error(`Row ${rowNumber}: Duplicate Roll Number (${student.rollNumber}) in this file.`);
        }
        if (student.aadharNumber && batchAadharNumbers.has(student.aadharNumber)) {
          throw new Error(`Row ${rowNumber}: Duplicate Aadhar Number in this file.`);
        }

        // Add to sets
        batchAdmissionNos.add(student.admissionNo);
        if (student.rollNumber) batchRollNumbers.add(student.rollNumber);
        if (student.aadharNumber) batchAadharNumbers.add(student.aadharNumber);

        // Normalize strings
        this.bulkStudentRecord[i].admissionNo = student.admissionNo;
        this.bulkStudentRecord[i].rollNumber = student.rollNumber;
        this.bulkStudentRecord[i].parentsContact = student.parentsContact;
        this.bulkStudentRecord[i].gender = String(student.gender).toLowerCase().trim();
        this.bulkStudentRecord[i].category = String(student.category).toLowerCase().trim();
        this.bulkStudentRecord[i].medium = String(student.medium).toLowerCase().trim();
        this.bulkStudentRecord[i].admissionType = String(student.admissionType).toLowerCase().trim();
        this.bulkStudentRecord[i].admissionClass = String(student.admissionClass).trim();
      }

    } catch (err: any) {
      this.errorCheck = true;
      this.errorMsg = err.error;
      this.isClick = false;
      return;
    }

    // --- API Submission ---
    const studentRecordData = {
      bulkStudentRecord: this.bulkStudentRecord,
      session: this.selectedSession,
      class: this.className,
      stream: this.stream,
      adminId: this.adminId,
      createdBy: 'Admin',
    };

    this.studentService.addBulkStudentRecord(studentRecordData).subscribe(
      (res: any) => {
        this.isClick = false;
        this.successDone(res);
      },
      err => {
        this.errorCheck = true;
        this.errorMsg = err.error;
        this.isClick = false;
      }
    );
  }
  async exportToExcel() {
    // Check if not currently exporting
    if (this.isClick) return;

    this.isClick = true; // Set bulk exporting state

    try {
      let className = this.className;
      if (className == 1) {
        className = `${this.className}st`;
      }
      if (className == 2) {
        className = `${this.className}nd`;
      }
      if (className == 3) {
        className = `${this.className}rd`;
      }
      if (className >= 4 && className <= 12) {
        className = `${this.className}th`;
      }
      if (className == 200) {
        className = `Nursery`;
      }
      if (className == 201) {
        className = `LKG`;
      }
      if (className == 202) {
        className = `UKG`;
      }
      let samagraId = 'samagraId' //dynamic field add testing
      const header: string[] = [
        'admissionNo',
        'name',
        'fatherName',
        'motherName',
        'rollNumber',
        'medium',
        'feesConcession',
        'aadharNumber',
        samagraId,
        'dob',
        'doa',
        'admissionType',
        'admissionClass',
        'gender',
        'category',
        'religion',
        'nationality',
        'address',
        'udiseNumber',
        'bankAccountNo',
        'bankIfscCode',
        'fatherQualification',
        'motherQualification',
        'fatherOccupation',
        'motherOccupation',
        'parentsContact',
        'familyAnnualIncome',
      ];
      function toTitleCase(str: string): string {
        return str.replace(/\w\S*/g, (txt) =>
          txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase()
        );
      }

      function orderObjectsByHeaders(
        studentInfoByClass: any[],
        headers: string[],
        selectedSession: string
      ): any[] {
        const stringFieldsSet = new Set([
          "name", "fatherName", "motherName", "medium", "admissionType", "gender",
          "admissionClass", "category", "religion", "nationality", "address",
          "fatherQualification", "motherQualification", "fatherOccupation", "motherOccupation"
        ]);

        const categorySet = new Set(["obc", "sc", "st", "ews"]);

        return studentInfoByClass
          .filter(obj => obj.session === selectedSession)
          .map(obj => {
            const result: any = {};
            for (let i = 0; i < headers.length; i++) {
              const key = headers[i];
              let value = obj[key];

              if (typeof value === "string" && stringFieldsSet.has(key)) {
                value =
                  key === "category" && categorySet.has(value.toLowerCase())
                    ? value.toUpperCase()
                    : toTitleCase(value);
              }

              result[key] = value;
            }
            return result;
          });
      }

      const orderedData = await orderObjectsByHeaders(this.studentInfoByClass, header, this.selectedSession);
      const modifiedHeader = header.map(field =>
        field.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())
      );

      let reportData = {
        title: `${this.schoolInfo?.schoolName}, Student Record Class - ${className}, ${this.selectedSession}`,
        data: orderedData,
        headers: modifiedHeader,
        fileName: `Student Class - ${className}, ${this.selectedSession}, ${this.schoolInfo?.schoolName}`,
      };

      this.ete.exportExcel(reportData);
      this.isClick = false; // Reset on success
      this.successDone("Student Data Exported Successfully");
    } catch (error) {
      this.isClick = false; // Reset on error
      this.errorCheck = true;
      this.errorMsg = 'Error occurred while exporting data';
    }
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
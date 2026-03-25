import { Component, ElementRef, ViewChild, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
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
import { ClassSubjectService } from 'src/app/services/class-subject.service';
import { TeacherAuthService } from 'src/app/services/auth/teacher-auth.service';
import { TeacherService } from 'src/app/services/teacher.service';
import { ToastrService } from 'ngx-toastr';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-teacher-student',
  templateUrl: './teacher-student.component.html',
  styleUrls: ['./teacher-student.component.css']
})
export class TeacherStudentComponent implements OnInit {
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
  teacherInfo: any;
  createdBy: String = '';
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
  logoPreview: any = null;

  constructor(
    private fb: FormBuilder, 
    public activatedRoute: ActivatedRoute, 
    private toastr: ToastrService, 
    private academicSessionService: AcademicSessionService, 
    private printPdfService: PrintPdfService, 
    private teacherAuthService: TeacherAuthService, 
    private teacherService: TeacherService, 
    private schoolService: SchoolService, 
    public ete: ExcelService, 
    private classService: ClassService, 
    private classSubjectService: ClassSubjectService, 
    private studentService: StudentService
  ) {
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
      studentImage: [''],
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
    this.allOptions();
    var currentURL = window.location.href;
    this.baseURL = new URL(currentURL).origin;
  }

  setAdminInfo() {
    this.teacherInfo = this.teacherAuthService.getLoggedInTeacherInfo();
    if (this.teacherInfo?.id) {
      this.adminId = this.teacherInfo?.adminId;
      this.getTeacherById(this.teacherInfo)
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

  getTeacherById(teacherInfo: any) {
    let params = {
      adminId: teacherInfo.adminId,
      teacherUserId: teacherInfo.id,
    }
    this.teacherService.getTeacherById(params).subscribe((res: any) => {
      if (res) {
        this.classInfo = res.studentPermission.classes;
        this.createdBy = `${res.name} (${res.teacherUserId})`;
      }
    })
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
    formValues.createdBy = this.createdBy;
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
        this.errorMsg = err.error || 'An error occurred while updating student.';
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
        this.errorMsg = err.error || 'An error occurred while adding student.';
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
      this.errorMsg = err.error || 'An error occurred while deleting student.';
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
      worksheet!.eachRow({ includeEmpty: false }, (row: any, rowNumber) => {
        if (rowNumber === 1) {
          const headers = row.values.map(String);
          data.push(headers);
        } else {
          const rowData = row.values.map(String);
          data.push(rowData);
        }
      });
      const lastIndex = data.length - 1;
      const indexesToDelete = [0, lastIndex];
      indexesToDelete.sort((a, b) => b - a);
      indexesToDelete.forEach((index) => {
        data.splice(index, 1);
      });
      const fields = data[0];
      const dataRows = data.slice(1);

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

      const mappedData = dataRows.map((row: any) => {
        const obj: any = {};

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
              const newKey = key.replace(/\s+/g, '');
              newObj[newKey.charAt(0).toLowerCase() + newKey.slice(1)] = obj[key];
            }
          }
          return newObj;
        });
      }

      const transformedDataArray = transformKeys(mappedData);
      if (transformedDataArray.length > 200) {
        this.fileChoose = false;
        this.errorCheck = true;
        this.errorMsg = 'File too large, Please make sure that file records to less then or equals to 200';
      }
      if (transformedDataArray.length <= 200) {
        this.bulkStudentRecord = transformedDataArray;
        this.fileChoose = true;
        this.errorCheck = false;
        this.errorMsg = '';
      }
    }).catch(err => {
      this.errorCheck = true;
      this.errorMsg = 'Error parsing Excel file. Please check the file format.';
    });
  }

  addBulkStudentRecord() {
    // Check if not currently importing and file is chosen
    if (this.isClick || !this.fileChoose) return;

    this.isClick = true;
    this.errorCheck = false;
    this.errorMsg = '';

    let studentRecordData = {
      bulkStudentRecord: this.bulkStudentRecord,
      session: this.selectedSession,
      class: this.className,
      stream: this.stream,
      adminId: this.adminId,
      createdBy: this.createdBy,
    }

    if (studentRecordData) {
      this.studentService.addBulkStudentRecord(studentRecordData).subscribe((res: any) => {
        if (res) {
          this.isClick = false;
          this.successDone(res);
        }
      }, err => {
        this.errorCheck = true;
        this.errorMsg = err.error || 'An error occurred while importing bulk student records.';
        this.isClick = false;
      })
    }
  }

  async exportToExcel() {
    // Check if not currently exporting
    if (this.isClick) return;

    this.isClick = true;

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
      let samagraId = 'samagraId'
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
      this.isClick = false;
      this.successDone("Student Data Exported Successfully");
    } catch (error) {
      this.isClick = false;
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
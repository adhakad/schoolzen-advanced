import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Router } from '@angular/router';
import { MatRadioChange } from '@angular/material/radio';
import { AdmitCardStructureService } from 'src/app/services/admit-card-structure.service';
import { AdmitCardService } from 'src/app/services/admit-card.service';
import { PrintPdfService } from 'src/app/services/print-pdf/print-pdf.service';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { TeacherAuthService } from 'src/app/services/auth/teacher-auth.service';
import { TeacherService } from 'src/app/services/teacher.service';
import { SchoolService } from 'src/app/services/school.service';
import { ClassService } from 'src/app/services/class.service';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-teacher-admit-card',
  templateUrl: './teacher-admit-card.component.html',
  styleUrls: ['./teacher-admit-card.component.css']
})
export class TeacherAdmitCardComponent implements OnInit {
  public baseUrl = environment.API_URL;
  allAdmitCards: any[] = [];
  cls: number = 0;
  classInfo: any[] = [];
  admitCardInfo: any;
  studentInfo: any;
  loader: Boolean = true;
  showModal: Boolean = false;
  admitCardStrInfo: any;
  admitCardStrInfoByStream: any;
  errorCheck: Boolean = false;
  statusCode: Number = 0;
  templateStatusCode: Number = 0;
  processedData: any[] = [];
  schoolInfo: any;
  baseURL!: string;
  stream: string = '';
  notApplicable: string = "stream";
  examType: any[] = [];
  streamMainSubject: any[] = ['mathematics(science)', 'biology(science)', 'history(arts)', 'sociology(arts)', 'political science(arts)', 'accountancy(commerce)', 'economics(commerce)', 'agriculture', 'home science'];
  selectedValue: number = 0;
  adminId!: string;
  teacherInfo: any;

  constructor(
    public activatedRoute: ActivatedRoute, 
    private router: Router, 
    private adminAuthService: AdminAuthService, 
    private teacherAuthService: TeacherAuthService, 
    private teacherService: TeacherService, 
    private schoolService: SchoolService, 
    private classService: ClassService, 
    private admitCardService: AdmitCardService, 
    private printPdfService: PrintPdfService, 
    private admitCardStructureService: AdmitCardStructureService
  ) { }

  ngOnInit(): void {
    this.teacherInfo = this.teacherAuthService.getLoggedInTeacherInfo();
    this.adminId = this.teacherInfo?.adminId;
    
    if (this.teacherInfo) {
      this.getTeacherById(this.teacherInfo);
    }
    
    this.getSchool();
    
    this.activatedRoute.queryParams.subscribe((params) => {
      this.cls = +params['cls'] || 0;
      this.stream = params['stream'] || '';
      
      if (this.cls) {
        this.getAdmitCardStructureByClass();
        this.getStudentAdmitCardByClass();
      } else {
        this.cls = 0;
        this.stream = '';
        this.processedData = []; // Added to match admin
      }
    });
    
    var currentURL = window.location.href;
    this.baseURL = new URL(currentURL).origin;
    
    setTimeout(() => {
      this.loader = false;
    }, 1000);
  }

  onChange(event: MatRadioChange) {
    this.selectedValue = event.value;
  }

  chooseClass(cls: number) {
    this.cls = cls;
    
    if (cls !== 11 && cls !== 12) {
      this.stream = this.notApplicable;
      this.processedData = []; // Added to match admin
      this.updateRouteParams();
      this.getAdmitCardStructureByClass();
      this.getStudentAdmitCardByClass();
    }
    
    if (cls == 11 || cls == 12) {
      if (this.stream == 'stream') {
        this.stream = '';
      }
      this.processedData = []; // Added to match admin
      this.updateRouteParams();
      this.getAdmitCardStructureByClass();
      this.getStudentAdmitCardByClass();
    }
  }

  filterStream(stream: any) {
    this.stream = stream;
    
    if (stream && this.cls) {
      this.processedData = []; // Added to match admin
      this.updateRouteParams();
      this.getAdmitCardStructureByClass();
      this.getStudentAdmitCardByClass();
    }
  }

  updateRouteParams() {
    this.router.navigate([], {
      relativeTo: this.activatedRoute,
      queryParams: { cls: this.cls || null, stream: this.stream || null },
      queryParamsHandling: 'merge'
    });
  }

  getTeacherById(teacherInfo: any) {
    let params = {
      adminId: teacherInfo.adminId,
      teacherUserId: teacherInfo.id,
    };
    
    this.teacherService.getTeacherById(params).subscribe((res: any) => {
      if (res) {
        this.classInfo = res.admitCardPermission.classes;
      }
    });
  }

  closeModal() {
    this.showModal = false;
    this.processedData = [];
  }

  bulkPrint(selectedValue: any) {
    this.selectedValue = selectedValue;
    this.processData();
    this.showModal = true;
  }

  getAdmitCardStructureByClass() {
    let params = {
      cls: this.cls,
      adminId: this.adminId,
      stream: this.stream
    };
    
    this.admitCardStructureService.admitCardStructureByClassStream(params).subscribe((res: any) => {
      if (res) {
        this.errorCheck = false;
        this.templateStatusCode = 200;
        this.admitCardStrInfo = res;
      }
    }, err => {
      this.errorCheck = true;
      this.templateStatusCode = err.status;
    });
  }

  getSchool() {
    this.schoolService.getSchool(this.adminId).subscribe((res: any) => {
      if (res) {
        this.schoolInfo = res;
      }
    });
  }

  printStudentData() {
    if (this.selectedValue == 0) {
      const printContent = this.getPrintOneAdmitCardContent();
      this.printPdfService.printContent(printContent);
    }
    if (this.selectedValue == 1) {
      const printContent = this.getPrintTwoAdmitCardContent();
      this.printPdfService.printContent(printContent);
    }
    this.closeModal();
  }

  private getStudentHtml(student: any): string {
    const studentElement = document.getElementById(`student-${student.studentId}`);
    if (studentElement) {
      return studentElement.outerHTML;
    }
    return '';
  }

  private getPrintOneAdmitCardContent(): string {
    let schoolLogo = this.schoolInfo.schoolLogo;

    let printHtml = '<html>';
    printHtml += '<head>';
    printHtml += '<style>';
    printHtml += '@page { size: A3; margin: 10mm; }';
    printHtml += 'body {width: 100%; height: 100%; margin: 0; padding: 0; position: relative; }';
    printHtml += 'div {margin: 0; padding: 0;}';
    printHtml += '.page-wrapper { position: relative; min-height: 100vh; }';
    printHtml += '.student-container { position: relative; }';
    printHtml += '.custom-container {font-family: Arial, sans-serif;overflow: auto; width: 100%; height: auto; box-sizing: border-box; position: relative; z-index: 2;}';
    printHtml += '.table-container {width: 100%;height: auto; background-color: #fff;border: 2px solid #454545; box-sizing: border-box;}';
    printHtml += '.logo { height: 80px;margin-top:15px;margin-left:10px;}';
    printHtml += '.school-name {display: flex; align-items: center; justify-content: center; text-align: center; }';
    printHtml += '.school-name h3 { color: #0a0a0a !important; font-size: 26px !important;font-weight: bolder;margin-top:-125px !important; margin-bottom: 0 !important; }';
    printHtml += '.address{margin-top: -40px;}';
    printHtml += '.address p{font-size:18px;margin-top: -15px !important;}';
    printHtml += '.title-lable {text-align: center;margin-top: -5px;margin-bottom: 0;}';
    printHtml += '.title-lable p {color: #0a0a0a !important;font-size: 22px;font-weight: bold;letter-spacing: .5px;}';
    printHtml += '.info-table {width:100%;color: #0a0a0a !important;border: none;font-size: 18px;margin-top: 2px;margin-bottom: 6px;padding-top:12px;padding-bottom:4px;display: inline-table;}';
    printHtml += '.table-container .info-table th, .table-container .info-table td{color: #0a0a0a !important;text-align:left;padding-left:15px;}';
    printHtml += '.custom-table {width: 100%;color: #0a0a0a !important;border-collapse:collapse;margin-bottom: -8px;display: inline-table;border-radius:5px;}';
    printHtml += '.custom-table th{height: 35px;text-align: center;border:1px solid #454545;line-height:15px;font-size: 18px;}';
    printHtml += '.custom-table tr{height: 35px;}';
    printHtml += '.custom-table td {text-align: center;border:1px solid #454545;font-size: 18px;}';
    printHtml += '.text-bold { font-weight: bold;}';
    printHtml += '.text-left { text-align: left;}';
    printHtml += 'p {color: #0a0a0a !important;font-size:20px;}';
    printHtml += 'h4 {color: #0a0a0a !important;font-size:22px;}';

    printHtml += '.watermark-container {';
    printHtml += ' position: absolute;';
    printHtml += ' top: 0;';
    printHtml += ' left: 0;';
    printHtml += ' width: 100%;';
    printHtml += ' height: 100vh;';
    printHtml += ' z-index: 1000;';
    printHtml += ' pointer-events: none;';
    printHtml += '}';

    printHtml += '.watermark-logo {';
    printHtml += ' position: absolute;';
    printHtml += ' top: 30%;';
    printHtml += ' left: 50%;';
    printHtml += ' transform: translate(-50%, -50%);';
    printHtml += ' opacity: 0.02;';
    printHtml += ' width: 40%;';
    printHtml += ' height: auto;';
    printHtml += ' max-width: 500px;';
    printHtml += '}';

    printHtml += '@media print {';
    printHtml += ' .page-wrapper { page-break-after: always; height: 100vh; }';
    printHtml += ' .page-wrapper:last-child { page-break-after: auto; }';
    printHtml += ' .watermark-container { ';
    printHtml += '   -webkit-print-color-adjust: exact !important; ';
    printHtml += '   color-adjust: exact !important; ';
    printHtml += '   print-color-adjust: exact !important;';
    printHtml += '   position: fixed !important;';
    printHtml += ' }';
    printHtml += ' .watermark-logo { ';
    printHtml += '   -webkit-print-color-adjust: exact !important; ';
    printHtml += '   color-adjust: exact !important; ';
    printHtml += '   print-color-adjust: exact !important;';
    printHtml += ' }';
    printHtml += '}';

    printHtml += '</style>';
    printHtml += '</head>';
    printHtml += '<body>';

    this.allAdmitCards.forEach((student, index) => {
      printHtml += `<div class="page-wrapper" id="page-${index}">`;
      printHtml += '<div class="student-container">';
      printHtml += '<div class="watermark-container">';
      if (schoolLogo) {
        printHtml += `<img src="${schoolLogo}" class="watermark-logo" alt="School Logo Watermark">`;
      }
      printHtml += '</div>';
      const studentElement = document.getElementById(`student-${student.studentId}`);
      if (studentElement) {
        printHtml += studentElement.outerHTML;
      }
      printHtml += '</div>';
      printHtml += '</div>';
    });
    
    printHtml += '</body></html>';
    return printHtml;
  }

  private getPrintTwoAdmitCardContent(): string {
    let schoolLogo = this.schoolInfo.schoolLogo;

    let printHtml = '<html>';
    printHtml += '<head>';
    printHtml += '<style>';
    printHtml += '@page { size: A3; margin: 10mm; }';
    printHtml += 'body {width: 100%; height: 100%; margin: 0; padding: 0; position: relative; }';
    printHtml += 'div {margin: 0; padding: 0;}';
    printHtml += '.page-wrapper { position: relative; min-height: 100vh; }';
    printHtml += '.student-container { position: relative; height: 48vh; margin-bottom: 2vh; }';
    printHtml += '.custom-container {font-family: Arial, sans-serif;overflow: auto; width: 100%; height: auto; box-sizing: border-box; position: relative; z-index: 2;}';
    printHtml += '.table-container {width: 100%;height: auto; background-color: #fff;border: 2px solid #454545; box-sizing: border-box;}';
    printHtml += '.logo { height: 80px;margin-top:15px;margin-left:10px;}';
    printHtml += '.school-name {display: flex; align-items: center; justify-content: center; text-align: center; }';
    printHtml += '.school-name h3 { color: #0a0a0a !important; font-size: 26px !important;font-weight: bolder;margin-top:-125px !important; margin-bottom: 0 !important; }';
    printHtml += '.address{margin-top: -40px;}';
    printHtml += '.address p{font-size:18px;margin-top: -15px !important;}';
    printHtml += '.title-lable {text-align: center;margin-top: -5px;margin-bottom: 0;}';
    printHtml += '.title-lable p {color: #0a0a0a !important;font-size: 22px;font-weight: bold;letter-spacing: .5px;}';
    printHtml += '.info-table {width:100%;color: #0a0a0a !important;border: none;font-size: 18px;margin-top: 2px;margin-bottom: 6px;padding-top:12px;padding-bottom:4px;display: inline-table;}';
    printHtml += '.table-container .info-table th, .table-container .info-table td{color: #0a0a0a !important;text-align:left;padding-left:15px;}';
    printHtml += '.custom-table {width: 100%;color: #0a0a0a !important;border-collapse:collapse;margin-bottom: -8px;display: inline-table;border-radius:5px;}';
    printHtml += '.custom-table th{height: 35px;text-align: center;border:1px solid #454545;line-height:15px;font-size: 18px;}';
    printHtml += '.custom-table tr{height: 35px;}';
    printHtml += '.custom-table td {text-align: center;border:1px solid #454545;font-size: 18px;}';
    printHtml += '.text-bold { font-weight: bold;}';
    printHtml += '.text-left { text-align: left;}';
    printHtml += 'p {color: #0a0a0a !important;font-size:18px;}';
    printHtml += 'h4 {color: #0a0a0a !important;}';

    printHtml += '.watermark-container {';
    printHtml += '  position: absolute;';
    printHtml += '  top: 0;';
    printHtml += '  left: 0;';
    printHtml += '  width: 100%;';
    printHtml += '  height: 100%;';
    printHtml += '  z-index: 1000;';
    printHtml += '  pointer-events: none;';
    printHtml += '}';

    printHtml += '.watermark-logo {';
    printHtml += '  position: absolute;';
    printHtml += '  top: 50%;';
    printHtml += '  left: 50%;';
    printHtml += '  transform: translate(-50%, -50%);';
    printHtml += '  opacity: 0.2;';
    printHtml += '  width: 35%;';
    printHtml += '  height: auto;';
    printHtml += ' max-width: 500px;';
    printHtml += '}';

    printHtml += '@media print {';
    printHtml += '  .watermark-container { -webkit-print-color-adjust: exact !important; color-adjust: exact !important; }';
    printHtml += '}';

    printHtml += '</style>';
    printHtml += '</head>';
    printHtml += '<body>';

    for (let i = 0; i < this.allAdmitCards.length; i += 2) {
      const student1 = this.allAdmitCards[i];
      const student2 = i + 1 < this.allAdmitCards.length ? this.allAdmitCards[i + 1] : null;

      printHtml += '<div class="page-wrapper">';

      printHtml += '<div class="student-container">';
      printHtml += '<div class="watermark-container">';
      if (schoolLogo) {
        printHtml += `<img src="${schoolLogo}" class="watermark-logo" alt="School Logo Watermark">`;
      }
      printHtml += '</div>';
      printHtml += this.getStudentHtml(student1);
      printHtml += '</div>';

      if (student2) {
        printHtml += '<div class="student-container">';
        printHtml += '<div class="watermark-container">';
        if (schoolLogo) {
          printHtml += `<img src="${schoolLogo}" class="watermark-logo" alt="School Logo Watermark">`;
        }
        printHtml += '</div>';
        printHtml += this.getStudentHtml(student2);
        printHtml += '</div>';
      }

      printHtml += '</div>';

      if (i + 2 < this.allAdmitCards.length) {
        printHtml += '<div style="page-break-after: always;"></div>';
      }
    }

    printHtml += '</body></html>';
    return printHtml;
  }

  processData() {
    for (let i = 0; i < this.admitCardStrInfo.examDate.length; i++) {
      const subject = Object.keys(this.admitCardStrInfo.examDate[i])[0];
      const date = Object.values(this.admitCardStrInfo.examDate[i])[0];
      const startTime = Object.values(this.admitCardStrInfo.examStartTime[i])[0];
      const endTime = Object.values(this.admitCardStrInfo.examEndTime[i])[0];

      this.processedData.push({
        subject,
        date,
        timing: `${startTime} to ${endTime}`
      });
    }
  }

  getStudentAdmitCardByClass() {
    let params = {
      cls: this.cls,
      adminId: this.adminId,
      stream: this.stream
    };
    
    this.admitCardService.getAllStudentAdmitCardByClass(params).subscribe((res: any) => {
      if (res) {
        this.errorCheck = false;
        this.statusCode = 200;
        this.admitCardInfo = res.admitCardInfo;
        this.studentInfo = res.studentInfo;
        
        const studentInfoMap = new Map();
        this.studentInfo.forEach((item: any) => {
          studentInfoMap.set(item._id, item);
        });

        const combinedData = this.admitCardInfo.reduce((result: any, admitCard: any) => {
          const studentInfo = studentInfoMap.get(admitCard.studentId);

          if (studentInfo) {
            result.push({
              session: studentInfo.session,
              studentId: admitCard.studentId,
              class: admitCard.class,
              stream: admitCard.stream,
              examType: admitCard.examType,
              status: admitCard.status || "",
              name: studentInfo.name,
              dob: studentInfo.dob,
              fatherName: studentInfo.fatherName,
              motherName: studentInfo.motherName,
              rollNumber: studentInfo.rollNumber,
              admissionNo: studentInfo.admissionNo
            });
          }

          return result;
        }, []);
        
        if (combinedData) {
          this.allAdmitCards = combinedData.sort((a: any, b: any) => a.name.localeCompare(b.name));
        }
      }
    }, err => {
      this.errorCheck = true;
      this.statusCode = err.status;
    });
  }
}
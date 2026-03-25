import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Router } from '@angular/router';
import { MatRadioChange } from '@angular/material/radio';
import { AdmitCardService } from 'src/app/services/admit-card.service';
import { PrintPdfService } from 'src/app/services/print-pdf/print-pdf.service';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { StudentService } from 'src/app/services/student.service';
import { SchoolService } from 'src/app/services/school.service';
import { IdCardService } from 'src/app/services/id-card.service';
import { ClassService } from 'src/app/services/class.service';
import { environment } from 'src/environments/environment';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-admin-id-card',
  templateUrl: './admin-id-card.component.html',
  styleUrls: ['./admin-id-card.component.css']
})
export class AdminIdCardComponent implements OnInit {
  public baseUrl = environment.API_URL;
  allAdmitCards: any[] = [];
  cls: number = 0;
  classInfo: any[] = [];
  admitCardInfo: any;
  studentInfo: any;
  loader: Boolean = true;
  showModal: Boolean = false;
  admitCardStrInfoByStream: any;
  errorCheck: Boolean = false;
  statusCode: Number = 0;
  templateStatusCode: Number = 0;
  processedData: any[] = [];
  schoolInfo: any;
  baseURL!: string;
  examType: any[] = [];
  stream: string = '';
  notApplicable: string = "stream";
  streamMainSubject: any[] = ['mathematics(science)', 'biology(science)', 'history(arts)', 'sociology(arts)', 'political science(arts)', 'accountancy(commerce)', 'economics(commerce)', 'agriculture', 'home science'];
  selectedValue: number = 0;
  adminId!: string;

  constructor(
    public activatedRoute: ActivatedRoute,
    private router: Router,
    private adminAuthService: AdminAuthService,
    private schoolService: SchoolService,
    private idCardService: IdCardService,
    private classService: ClassService,
    private toastr: ToastrService,
    private printPdfService: PrintPdfService,
    private studentService: StudentService
  ) { }

  ngOnInit(): void {
    let getAdmin = this.adminAuthService.getLoggedInAdminInfo();
    this.adminId = getAdmin?.id;
    this.getSchool();
    this.getClass();
    this.activatedRoute.queryParams.subscribe((params) => {
      this.cls = +params['cls'] || 0;
      this.stream = params['stream'] || '';
      if (this.cls) {
        this.getStudentByClassWithoutStream();
      } else {
        this.cls = 0;
        this.processedData = [];
      }
    });
    var currentURL = window.location.href;
    this.baseURL = new URL(currentURL).origin;
    setTimeout(() => {
      this.loader = false;
    }, 1000)
  }

  getClass() {
    this.classService.getClassList().subscribe((res: any) => {
      if (res) {
        this.classInfo = res.map((item: any) => item.class);
      }
    })
  }

  onChange(event: MatRadioChange) {
    this.selectedValue = event.value;
  }

  chooseClass(cls: number) {
    this.cls = cls;
    this.processedData = [];
    this.updateRouteParams();
    this.getStudentByClassWithoutStream();
  }

  updateRouteParams() {
    this.router.navigate([], {
      relativeTo: this.activatedRoute,
      queryParams: { cls: this.cls || null, stream: this.stream || null },
      queryParamsHandling: 'merge'
    });
  }

  closeModal() {
    this.showModal = false;
    this.processedData = [];
  }

  bulkPrint(selectedValue: any) {
    this.selectedValue = selectedValue;
    this.showModal = true;
  }


  getSchool() {
    this.schoolService.getSchool(this.adminId).subscribe((res: any) => {
      if (res) {
        this.schoolInfo = res;
      }
    })
  }
  orderIdCard() {
    this.idCardService.orderIdCard(this.adminId).subscribe((res: any) => {
      if (res) {
        this.toastr.success('', res);
      }
    })
  }

  printStudentData() {
    if (this.selectedValue == 1) {
      const printContent = this.getPrintDualIdCardContent();
      this.printPdfService.printContent(printContent);
    }
    this.closeModal();
  }

  private getPrintDualIdCardContent(): string {
    let printHtml = '<html>';
    printHtml += '<head>';
    printHtml += '<style>';
    // Custom page size: 12x18 inches (304.8mm x 457.2mm)
    printHtml += '@page { size: 304.8mm 457.2mm; margin: 12.7mm; }';
    printHtml += 'body { width: 100%; height: 100%; margin: 0; padding: 0; font-family: Arial, sans-serif; }';
    // Grid layout for 25 cards (5x5) - consistent mm units
    printHtml += '.print-container { display: grid; grid-template-columns: repeat(5, 1fr); grid-template-rows: repeat(5, 1fr); gap: 5mm; width: 100%; height: 100%; padding: 5mm; }';
    printHtml += this.getIdCardStyles();
    printHtml += '.dual-id-card-container { display: flex; align-items: center; justify-content: center; break-inside: avoid; }';
    printHtml += '.page-break { page-break-before: always; }';
    printHtml += '</style>';
    printHtml += '</head>';
    printHtml += '<body>';
    printHtml += '<div class="print-container">';

    this.allAdmitCards.forEach((student, index) => {
      // Add page break after every 25 cards
      if (index > 0 && index % 25 === 0) {
        printHtml += '</div><div class="print-container page-break">';
      }

      printHtml += `<div class="dual-id-card-container">`;
      printHtml += this.generateIdCardHtml(student);
      printHtml += '</div>';
    });

    printHtml += '</div>';
    printHtml += '</body></html>';
    return printHtml;
  }

  private generateIdCardHtml(student: any): string {
    return `
      <div class="id-card">
        <!-- Header -->
        <div class="id-card-header">
          <div class="id-card-logo-box">
            <div class="id-card-logo-bg">
              <img src="${this.schoolInfo.schoolLogo}" 
                   alt="School Logo" class="id-card-logo">
            </div>
          </div>
          <div class="id-card-school-name">
            <span class="id-card-school-text">${(this.schoolInfo.schoolName).toUpperCase()}</span>
          </div>
        </div>
        
        <!-- Photo -->
        <div class="id-card-photo-section">
          <div class="id-card-photo-frame">
            <div class="id-card-photo-bg">
              <img src='${student?.studentImage}' 
                   alt="Student Photo" class="id-card-photo">
            </div>
          </div>
        </div>
        
        <!-- Info -->
        <div class="id-card-info">
          <div class="id-card-student-name">
            <div class="id-card-student-text">${(student.name).toUpperCase()}</div>
          </div>
          
          <div class="id-card-info-grid">
            <div class="id-card-info-row">
              <span class="id-card-info-label">Father Name</span>
              <span class="id-card-info-separator">:</span>
              <span class="id-card-info-value">${this.titleCase(student.fatherName)}</span>
            </div>
            <div class="id-card-info-row">
              <span class="id-card-info-label">Date of Birth</span>
              <span class="id-card-info-separator">:</span>
              <span class="id-card-info-value">${student?.dob}</span>
            </div>
            <div class="id-card-info-row">
              <span class="id-card-info-label">Mobile</span>
              <span class="id-card-info-separator">:</span>
              <span class="id-card-info-value">${student?.parentsContact || ''}</span>
            </div>
            <div class="id-card-info-row">
              <span class="id-card-info-label">Class</span>
              <span class="id-card-info-separator">:</span>
              <span class="id-card-info-value">${this.getClassSuffix(student?.class)}</span>
            </div>
          </div>
        </div>
        
        <!-- Signature -->
        <div class="id-card-signature">
          <img src="${this.schoolInfo?.principalSignature || '../../../../assets/screenshot-1750585576464.png'}" 
               alt="Principal Signature" class="id-card-signature-img">
          <span class="id-card-signature-text">PRINCIPAL SIGNATURE</span>
        </div>
        
        <!-- Footer -->
        <div class="id-card-footer">
          <span class="id-card-address">
            ADD - ${(this.schoolInfo?.street).toUpperCase()}, ${(this.schoolInfo?.city).toUpperCase()}-${this.schoolInfo?.pinCode}<br>
            CONTACT - ${this.schoolInfo?.phoneOne}
          </span>
        </div>
      </div>
    `;
  }

  private getIdCardStyles(): string {
    return `
       .id-card {
   width: 54mm; /* Adjusted from 58.21mm */
   height: 85.6mm; /* Adjusted from 92.6mm */
   background: #ffffff;
   border-radius: 3.92mm; /* Adjusted from 4.23mm (ratio: 0.927) */
   position: relative;
   overflow: hidden;
}

.id-card-header {
   height: 19.6mm; /* Adjusted from 21.17mm (ratio: 0.927) */
   background: linear-gradient(135deg, #401071ff 0%, #5625b9ff 50%, #a67affff 100%);
   display: flex;
   justify-content: flex-start;
   gap: 0;
   padding: 2.95mm 0 0 2.95mm; /* Adjusted from 3.18mm (ratio: 0.927) */
   border-radius: 3.92mm 3.92mm 50% 50%; /* Adjusted from 4.23mm */
}

.id-card-logo-box {
   width: 7.85mm; /* Adjusted from 8.47mm (ratio: 0.927) */
   height: 7.85mm; /* Adjusted from 8.47mm */
   background: rgba(255, 255, 255, 0.2);
   border-radius: 50%;
   display: flex;
   align-items: center;
   justify-content: center;
}

.id-card-logo-bg {
   width: 7.36mm; /* Adjusted from 7.94mm (ratio: 0.927) */
   height: 7.36mm; /* Adjusted from 7.94mm */
   background: #ffffff;
   border-radius: 1.47mm; /* Adjusted from 1.59mm (ratio: 0.927) */
   padding: 0.49mm; /* Adjusted from 0.53mm (ratio: 0.927) */
   display: flex;
   align-items: center;
   justify-content: center;
   font-size: 1.97mm; /* Adjusted from 2.12mm (ratio: 0.927) */
   font-weight: 600;
   color: #5625b9ff;
}

.id-card-logo {
   width: 6.38mm; /* Adjusted from 6.88mm (ratio: 0.927) */
   height: 6.38mm; /* Adjusted from 6.88mm */
}

.id-card-school-name {
   color: #ffffff;
   line-height: 1.2;
   text-shadow: 0 0.49mm 0.98mm rgba(0, 0, 0, 0.3); /* Adjusted from 0.53mm 1.06mm */
   height: 8.59mm; /* Adjusted from 9.26mm (ratio: 0.927) */
   text-align: center;
   display: flex;
   align-items: center;
   justify-content: center;
   word-wrap: break-word;
   overflow-wrap: break-word;
   hyphens: auto;
   padding-left: 1.97mm; /* Adjusted from 2.12mm (ratio: 0.927) */
   padding-right: 1.97mm; /* Adjusted from 2.12mm */
}

.id-card-school-text {
   font-size: 2.95mm; /* Adjusted from 3.18mm (ratio: 0.927) */
   font-weight: 900;
   letter-spacing: 0.12mm; /* Adjusted from 0.13mm (ratio: 0.927) */
   line-height: 3.92mm; /* Adjusted from 4.23mm (ratio: 0.927) */
   word-spacing: 0.49mm; /* Adjusted from 0.53mm (ratio: 0.927) */
   margin-bottom: 0.49mm; /* Adjusted from 0.53mm (ratio: 0.927) */
   display: inline-block;
}

.id-card-photo-section {
   position: absolute;
   top: 13.49mm; /* Adjusted from 14.55mm (ratio: 0.927) */
   left: 50%;
   transform: translateX(-50%);
   z-index: 10;
}

.id-card-photo-frame {
   width: 22.07mm; /* Adjusted from 23.81mm (ratio: 0.927) */
   height: 22.07mm; /* Adjusted from 23.81mm */
   border-radius: 50%;
   background: #f8f9fa;
   padding: 0.73mm; /* Adjusted from 0.79mm (ratio: 0.927) */
   position: relative;
}

.id-card-photo-bg {
   border: 0.49mm solid #5625b9ff; /* Updated to purple theme */
   padding: 0.49mm; /* Adjusted from 0.53mm */
   border-radius: 50%;
   overflow: hidden;
   background: #f8f9fa;
   display: flex;
   align-items: center;
   justify-content: center;
   position: relative;
}

.id-card-photo {
   width: 100%;
   height: 100%;
   object-fit: cover;
   border-radius: 50%;
}

.id-card-info {
   position: absolute;
   top: 38.93mm; /* Adjusted from 42mm (ratio: 0.927) */
   left: 3.92mm; /* Adjusted from 4.23mm (ratio: 0.927) */
   right: 3.92mm; /* Adjusted from 4.23mm */
   color: #302c50ff;
}

.id-card-student-name {
   text-align: center;
   padding-bottom: 1.62mm; /* Adjusted from 1.75mm (ratio: 0.927) */
   margin-bottom: 2.21mm; /* Adjusted from 2.38mm (ratio: 0.927) */
   border-bottom: 0.23mm solid #e3e4fdff; /* Updated to light purple */
}

.id-card-student-text {
   font-size: 2.33mm; /* Adjusted from 2.51mm (ratio: 0.927) */
   font-weight: 800;
   letter-spacing: 0.046mm; /* Adjusted from 0.05mm (ratio: 0.927) */
   color: #5021aeff; /* Updated to purple theme */
}

.id-card-info-grid {
   display: grid;
   gap: 1.39mm; /* Adjusted from 1.5mm (ratio: 0.927) */
}

.id-card-info-row {
   display: grid;
   grid-template-columns: 1fr auto 1fr;
   align-items: center;
   font-size: 2.21mm; /* Adjusted from 2.38mm (ratio: 0.927) */
   line-height: 1.4;
}

.id-card-info-label {
   font-weight: 600;
   color: #373748ff; /* Darker gray for better readability */
}

.id-card-info-separator {
   margin: 0 1.97mm; /* Adjusted from 2.12mm (ratio: 0.927) */
   color: #9490aeff; /* Purple-gray for separator */
   font-weight: 500;
}

.id-card-info-value {
   color: #373748ff; /* Darker gray for better readability */
   font-weight: 500;
   text-align: left;
}

/* Signature */
.id-card-signature {
   position: absolute;
   bottom: 10.2mm; /* Adjusted from 11mm (ratio: 0.927) */
   right: 3.68mm; /* Adjusted from 3.97mm (ratio: 0.927) */
   text-align: center;
}

.id-card-signature-img {
   height: 6.13mm; /* Adjusted from 6.61mm (ratio: 0.927) */
   display: block;
   margin: 0 auto;
}

.id-card-signature-text {
   color: #373748ff; /* Darker gray for better readability */
   font-size: 1.97mm; /* Adjusted from 2.12mm (ratio: 0.927) */
   font-weight: 800;
   opacity: 0.9;
   letter-spacing: 0.074mm; /* Adjusted from 0.08mm (ratio: 0.927) */
   display: block;
}

/* Footer */
.id-card-footer {
   position: absolute;
   bottom: 0;
   left: 0;
   right: 0;
   height: 6.26mm; /* Adjusted from 6.75mm (ratio: 0.927) */
   background: linear-gradient(135deg, #401071ff 0%, #5625b9ff 50%, #a67affff 100%);
   border-radius: 50% 50% 0 0;
   padding: 1.27mm 2.54mm 1.27mm 2.54mm; /* Converted from inches and adjusted */
   text-align: center;
   display: flex;
   align-items: center;
   justify-content: center;
   word-wrap: break-word;
   overflow-wrap: break-word;
   hyphens: auto;
   color: white;
}

.id-card-address {
   font-size: 1.78mm; /* Converted from 0.07in and adjusted */
   font-weight: 400;
   opacity: 0.9;
   letter-spacing: 0.076mm; /* Converted from 0.003in and adjusted */
   line-height: 2.54mm; /* Converted from 0.1in and adjusted */
}

      /* Print Specific Styles */
      @page {
          size: 304.8mm 457.2mm !important; /* 12in x 18in */
          margin: 2.5mm !important; /* 0.5in */
        }
        
        body {
          -webkit-print-color-adjust: exact !important;
          color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        
        .print-container {
          display: grid !important;
          grid-template-columns: repeat(5, 1fr) !important;
          grid-template-rows: repeat(5, 1fr) !important;
          gap: 2.5mm !important;
          width: 304.8mm !important; /* 304.8mm - 25.4mm margin */
          height:457.2mm !important; /* 457.2mm - 25.4mm margin */
          padding: 0 !important;
        }
        
        .dual-id-card-container {
          break-inside: avoid !important;
          page-break-inside: avoid !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        
        .page-break {
          page-break-before: always !important;
        }
        
        .id-card {
          border: 1px dashed #5625b9ff !important; /* Updated to purple theme */
        }
        
        /* Ensure images print properly */
        img {
          -webkit-print-color-adjust: exact !important;
          color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
      }
    `;
  }
  private titleCase(str: string): string {
    if (!str) return '';
    return str.toLowerCase().split(' ').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  }

  private getClassSuffix(cls: number): string {
    if (!cls) return '';

    if (cls >= 4 && cls <= 12) {
      return `${cls}th`;
    }
    if (cls === 1) {
      return `${cls}st`;
    }
    if (cls === 2) {
      return `${cls}nd`;
    }
    if (cls === 3) {
      return `${cls}rd`;
    }
    if (cls === 200) {
      return 'Nursery';
    }
    if (cls === 201) {
      return 'LKG';
    }
    if (cls === 202) {
      return 'UKG';
    }

    // ✅ default fallback
    return `${cls}`;
  }


  getStudentByClassWithoutStream() {
    let params = {
      class: this.cls,
      adminId: this.adminId,
    }
    this.studentService.getStudentByClassWithoutStream(params).subscribe((res: any) => {
      if (res) {
        this.allAdmitCards = res;
        // const classMappings: any = {
        //   200: "Nursery",
        //   201: "LKG",
        //   202: "UKG",
        //   1: "1st",
        //   2: "2nd",
        //   3: "3rd",
        // };
        // for (let i = 4; i <= 12; i++) {
        //   classMappings[i] = i + "th";
        // }
        // this.studentInfoByClass.forEach((student) => {
        //   student.class = classMappings[student.class] || "Unknown";
        //   student.admissionClass = classMappings[student.admissionClass] || "Unknown";
        // });
      }
    })
  }

  // getStudentAdmitCardByClass() {
  //   let params = {
  //     cls: this.cls,
  //     adminId: this.adminId,
  //     stream: this.stream
  //   }
  //   this.admitCardService.getAllStudentAdmitCardByClass(params).subscribe((res: any) => {
  //     if (res) {
  //       this.errorCheck = false;
  //       this.statusCode = 200;
  //       this.admitCardInfo = res.admitCardInfo;
  //       this.studentInfo = res.studentInfo;
  //       const studentInfoMap = new Map();
  //       this.studentInfo.forEach((item: any) => {
  //         studentInfoMap.set(item._id, item);
  //       });

  //       const combinedData = this.admitCardInfo.reduce((result: any, admitCard: any) => {
  //         const studentInfo = studentInfoMap.get(admitCard.studentId);

  //         if (studentInfo) {
  //           result.push({
  //             session: studentInfo.session,
  //             studentId: admitCard.studentId,
  //             class: admitCard.class,
  //             stream: admitCard.stream,
  //             examType: admitCard.examType,
  //             status: admitCard.status || "",
  //             name: studentInfo.name,
  //             dob: studentInfo.dob,
  //             fatherName: studentInfo.fatherName,
  //             motherName: studentInfo.motherName,
  //             rollNumber: studentInfo.rollNumber,
  //             admissionNo: studentInfo.admissionNo,
  //             mobile: studentInfo.mobile,
  //             photo: studentInfo.photo
  //           });
  //         }

  //         return result;
  //       }, []);

  //       if (combinedData) {
  //         this.allAdmitCards = combinedData.sort((a: any, b: any) => a.name.localeCompare(b.name));
  //       }
  //     }
  //   }, err => {
  //     this.errorCheck = true;
  //     this.statusCode = err.status;
  //   })
  // }
}
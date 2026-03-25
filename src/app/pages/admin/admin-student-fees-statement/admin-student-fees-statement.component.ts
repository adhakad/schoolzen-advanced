import { Component, ElementRef, ViewChild, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MatRadioChange } from '@angular/material/radio';
import { FeesStructureService } from 'src/app/services/fees-structure.service';
import { FeesService } from 'src/app/services/fees.service';
import { PrintPdfService } from 'src/app/services/print-pdf/print-pdf.service';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { SchoolService } from 'src/app/services/school.service';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-admin-student-fees-statement',
  templateUrl: './admin-student-fees-statement.component.html',
  styleUrls: ['./admin-student-fees-statement.component.css']
})
export class AdminStudentFeesStatementComponent implements OnInit {
  @ViewChild('content') content!: ElementRef;
  @ViewChild('receipt') receipt!: ElementRef;
  public baseUrl = environment.API_URL;
  cls: any;
  showModal: boolean = false;
  clsFeesStructure: any;
  studentFeesCollection: any;
  id: any;
  processedData: any[] = [];
  singleReceiptInstallment: any[] = [];
  studentInfo: any;
  schoolInfo: any;
  stream: any;
  loader: Boolean = true;
  adminId!: string;
  allSessionData: any[] = [];
  selectedValue: string = "1";
  constructor(public activatedRoute: ActivatedRoute, private adminAuthService: AdminAuthService, private schoolService: SchoolService, private printPdfService: PrintPdfService, private feesService: FeesService, private feesStructureService: FeesStructureService) { }

  ngOnInit(): void {
    let getAdmin = this.adminAuthService.getLoggedInAdminInfo();
    this.adminId = getAdmin?.id;
    this.id = this.activatedRoute.snapshot.paramMap.get('id');
    this.getSchool();
    if (this.adminId && this.id) {
      this.singleStudentFeesCollectionByStudentId(this.adminId, this.id);
    }
  }
  formatCurrency(value: any): string {
    value = parseInt(value);
    if (typeof value === 'number') {
      return '₹ ' + value.toLocaleString(undefined); // No minimumFractionDigits
    }
    return '₹ 0';
  }
  formatKey(key: any): string {
    if (typeof key === 'string') {
      return key.toUpperCase();
    }
    return '';
  }
  onChange(event: MatRadioChange) {
    this.singleStudentFeesCollectionByStudentId(this.adminId, event.value);
  }
  getSchool() {
    this.schoolService.getSchool(this.adminId).subscribe((res: any) => {
      if (res) {
        this.schoolInfo = res;
      }
    })
  }
  printStudentData() {
    const printContent = this.getPrintContent();
    this.printPdfService.printContent(printContent);
    this.closeModal();
  }


  private getPrintContent(): string {
    let schoolName = this.schoolInfo.schoolName;
    let city = this.schoolInfo.city;
    let schoolLogo = this.schoolInfo.schoolLogo;
    let printHtml = '<html>';
    printHtml += '<head>';
    printHtml += '<style>';
    printHtml += '@page { size: A3; margin: 10mm; }';
    printHtml += 'body {width: 100%; height: 100%; margin: 0; padding: 0; }';
    printHtml += 'div {margin: 0; padding: 0;}';
    printHtml += '.custom-container {font-family: Arial, sans-serif;overflow: auto; width: 100%; height: auto; box-sizing: border-box;}';
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
    printHtml += 'p {color: #0a0a0a !important;font-size:18px;}'
    printHtml += 'h4 {color: #0a0a0a !important;}'

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

  }
  feeReceipt(singleInstallment: any) {
    const data: any = this.processedData
    const desiredInstallment = singleInstallment;
    this.singleReceiptInstallment = data.filter((item: any) => item.paymentDate === desiredInstallment);
    this.singleReceiptInstallment[0].feesConcession = this.studentFeesCollection.feesConcession;
    this.showModal = true;

  }
  singleStudentFeesCollectionByStudentId(adminId: any, id: any) {
    let params = {
      adminId: adminId,
      id: id
    }
    this.processedData = [];
    this.feesService.singleStudentFeesCollectionByStudentId(params).subscribe((res: any) => {
      if (res) {
        this.selectedValue = id;
        this.studentFeesCollection = res.studentFeesCollection;
        this.studentInfo = res.studentInfo;
        this.allSessionData = res.allFeesSession;
        if (this.studentFeesCollection.admissionFeesPayable == true) {
          res.singleFeesStr.feesType = [{ Admission: res.singleFeesStr.admissionFees }, ...res.singleFeesStr.feesType];
          this.clsFeesStructure = res.singleFeesStr;
        }
        if (this.studentFeesCollection.admissionFeesPayable == false) {
          this.clsFeesStructure = res.singleFeesStr;
        }
        console.log(this.clsFeesStructure);
        this.processData();
      }
    })
  }

  processData() {
    let allPaidAmount = this.studentFeesCollection.admissionFees;
    for (let i = 0; i < this.studentFeesCollection.installment.length; i++) {
      const receiptNo = this.studentFeesCollection.receipt[i];
      const paidAmount: any = this.studentFeesCollection.installment[i];
      const paymentDate = this.studentFeesCollection.paymentDate[i];
      const createdBy = this.studentFeesCollection.createdBy[i];
      allPaidAmount += paidAmount;
      this.processedData.push({
        allPaidAmount,
        receiptNo,
        paidAmount,
        paymentDate,
        createdBy
      });
    }
    setTimeout(() => {
      this.loader = false;
    }, 1000);
  }
}

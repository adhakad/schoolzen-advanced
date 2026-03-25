import { Component, OnInit } from '@angular/core';
import * as echarts from 'echarts';
import { AdsService } from 'src/app/services/ads.service';


import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { BannerService } from 'src/app/services/banner.service';
import { ClassSubjectService } from 'src/app/services/class-subject.service';
import { ClassService } from 'src/app/services/class.service';
import { StudentService } from 'src/app/services/student.service';
import { SubjectService } from 'src/app/services/subject.service';
import { ExamResultService } from 'src/app/services/exam-result.service';
import { IssuedTransferCertificateService } from 'src/app/services/issued-transfer-certificate.service';
import { MessageWalletService } from 'src/app/services/whatsapp-message/message-wallet.service';
import { TeacherService } from 'src/app/services/teacher.service';
import { TestimonialService } from 'src/app/services/testimonial.service';
import { TopperService } from 'src/app/services/topper.service';
import { FeesService } from 'src/app/services/fees.service';
import { AcademicSessionService } from 'src/app/services/academic-session.service';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit {
  cookieValue: any;
  adsCountInfo: any;
  bannerCountInfo: any;
  classSubjectCountInfo: any;
  classCountInfo: any;
  studentCountInfo: number = 0;
  marksheetCountInfo: number = 0;
  remainingWhatsappMessageCountInfo: number = 0;
  teacherCountInfo: number = 0;
  transferCertificateCountInfo: any;
  testimonialCountInfo: any;
  topperCountInfo: any;
  loader: Boolean = true;
  adminId: string = '';
  totalFeesSum: number = 0;
  paidFeesSum: number = 0;
  dueFeesSum: number = 0;
  academicSession: string = '';
  allSession: any = [];
  selectedSession: string = '';
  monthlyFeesCollection: any = {};
  constructor(private adminAuthService: AdminAuthService, private academicSessionService: AcademicSessionService, private examResultService: ExamResultService, private messageWalletService: MessageWalletService, private issuedTransferCertificateService: IssuedTransferCertificateService, private adsService: AdsService, private bannerService: BannerService, private feesService: FeesService, private classSubjectService: ClassSubjectService, private classService: ClassService, private studentService: StudentService, private subjectService: SubjectService, private teacherService: TeacherService, private testimonialService: TestimonialService, private topperService: TopperService) { }
  ngOnInit(): void {
    let getAdmin = this.adminAuthService.getLoggedInAdminInfo();
    this.adminId = getAdmin?.id;
    this.getAcademicSession();
    if (this.adminId) {
      this.studentCount();
      this.teacherCount();
      this.marksheetCount();
      this.remainingWhatsappMessageCount();
      this.transferCertificateCount();
    }
    setTimeout(() => {
      this.loader = false;
    }, 1000);
  }
  getAcademicSession() {
    this.academicSessionService.getAcademicSession().subscribe((res: any) => {
      if (res) {
        this.selectedSession = res.academicSession;
        this.allSession = res.allSession;
        this.feesCollectionBySession(this.adminId, this.selectedSession);
      }
    })
  }
  initPieChart(): void {
    const chartDom = document.getElementById('pieChart') as HTMLElement;
    const chart = echarts.init(chartDom);

    const option = {
      title: {
        text: `{title|Fees Ratio :}  {subTitle|${this.selectedSession}}`, // Combine title and subtitle
        left: '3.5%',
        top: 20,
        textStyle: {
          rich: {
            title: {
              color: '#2c343c',
              fontSize: 16,
              fontWeight: 'bold',
            },
            subTitle: {
              color: '#434445',
              fontSize: 16,
              fontWeight: 'normal',
            }
          }
        }
      },

      tooltip: {
        trigger: 'item',
        formatter: function (params: any) {
          return `${params.name} <br/> ${params.marker}  ₹${params.value} &nbsp; (${params.percent}%)`;
        },
        backgroundColor: '#fff',  // Custom background color
        textStyle: {
          fontSize: 12,  // Font size for tooltip text
          color: '#2c343c'  // Text color
        }
      },
      legend: {
        orient: 'horizontal',    // Horizontal legend
        left: 'center',          // Center align horizontally
        bottom: 15,               // Position it at the bottom
        textStyle: {
          color: '#2c343c',      // Custom color for legend text
        }
      },
      series: [
        {
          name: 'Fees Distribution',
          type: 'pie',
          radius: ['40%', '50%'], // Donut style pie chart
          avoidLabelOverlap: false,
          top: 20,
          itemStyle: {
            borderRadius: 0, // Rounded borders for each slice
            borderColor: '#2c343c',
            borderWidth: 0,
          },
          label: {
            show: true,  // Enable labels in the pie chart
            formatter: function (params: any) {
              return `₹${params.value}`;  // Show name and amount
            },
            textStyle: {
              color: '#2c343c',  // Label text color
              fontSize: 12,   // Font size for label text
            }
          },
          emphasis: {
            label: {
              show: true,
              fontSize: '10',
              fontWeight: 'bold',
            },
            itemStyle: {
              // shadowBlur: 10,
              // shadowOffsetX: 0,
              // shadowColor: 'rgba(0, 0, 0, 0.3)',
            },
          },
          data: [
            { value: this.paidFeesSum, name: 'Paid Fees', itemStyle: { color: '#8C52FF' } },
            { value: this.dueFeesSum, name: 'Due Fees', itemStyle: { color: '#d0cdff' } },
          ],
        }
      ],
      backgroundColor: '#fff', // Dark background for a modern look
      animationDuration: 1000,
      animationEasing: 'cubicOut' as 'cubicOut',
    };

    chart.setOption(option);
    window.addEventListener('resize', function () {
      chart.resize();  // Make chart responsive on window resize
    });
  }





  initBarCharts(): void {
    const chartDom = document.getElementById('lineChart') as HTMLElement;
    const chart = echarts.init(chartDom);


    const option = {
      title: {
        text: `{title|Monthly Collection :}  {subTitle|${this.selectedSession}}`, // Combine title and subtitle
        left: '3.5%',
        top: 20,
        textStyle: {
          rich: {
            title: {
              color: '#2c343c',
              fontSize: 16,
              fontWeight: 'bold',
            },
            subTitle: {
              color: '#434445',
              fontSize: 16,
              fontWeight: 'normal',
            }
          }
        }
      },
      tooltip: {
        trigger: 'axis',
        formatter: function (params: any) {
          const param = params[0];
          return `${param.name} <br/> ${param.marker}  ₹${param.value}`;
        },
        axisPointer: {
          type: 'shadow'
        },
        textStyle: {
          color: '#2c343c',
          fontSize: 12,
        }
      },
      grid: {
        top: 100,  // Increase this value to give more space under the title
        left: '5%',
        right: '5%',
        bottom: '3%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
        axisLine: {
          lineStyle: {
            color: '#2c343c'
          }
        },
        axisTick: {
          show: false
        }
      },
      yAxis: {
        type: 'value',
        axisLine: {
          lineStyle: {
            color: '#2c343c'
          }
        },
        splitLine: {
          lineStyle: {
            type: 'dashed'
          }
        },
        axisLabel: {
          formatter: function (value: number) {
            return '₹' + value;
          }
        }
      },
      series: [
        {
          name: 'Fees',
          type: 'bar',
          data: [
            // { value: 15000, itemStyle: { color: '#8C52FF' } },
            // { value: 6000, itemStyle: { color: '#8C52FF' } },
            // { value: 9000, itemStyle: { color: '#8C52FF' } },
            // { value: 15000, itemStyle: { color: '#8C52FF' } },
            // { value: 8000, itemStyle: { color: '#8C52FF' } },
            // { value: 16000, itemStyle: { color: '#8C52FF' } },
            // { value: 9000, itemStyle: { color: '#8C52FF' } },
            // { value: 11000, itemStyle: { color: '#8C52FF' } },
            // { value: 20000, itemStyle: { color: '#8C52FF' } },
            // { value: this.monthlyFeesCollection.October, itemStyle: { color: '#8C52FF' } },
            // { value: 9000, itemStyle: { color: '#8C52FF' } },
            // { value: 7500, itemStyle: { color: '#8C52FF' } },


            { value: this.monthlyFeesCollection.January, itemStyle: { color: '#8C52FF' } },
            { value: this.monthlyFeesCollection.February, itemStyle: { color: '#8C52FF' } },
            { value: this.monthlyFeesCollection.March, itemStyle: { color: '#8C52FF' } },
            { value: this.monthlyFeesCollection.April, itemStyle: { color: '#8C52FF' } },
            { value: this.monthlyFeesCollection.May, itemStyle: { color: '#8C52FF' } },
            { value: this.monthlyFeesCollection.June, itemStyle: { color: '#8C52FF' } },
            { value: this.monthlyFeesCollection.July, itemStyle: { color: '#8C52FF' } },
            { value: this.monthlyFeesCollection.August, itemStyle: { color: '#8C52FF' } },
            { value: this.monthlyFeesCollection.September, itemStyle: { color: '#8C52FF' } },
            { value: this.monthlyFeesCollection.October, itemStyle: { color: '#8C52FF' } },
            { value: this.monthlyFeesCollection.November, itemStyle: { color: '#8C52FF' } },
            { value: this.monthlyFeesCollection.December, itemStyle: { color: '#8C52FF' } },
          ],
          barWidth: '50%',
        }
      ],
      backgroundColor: '#fff',
      animationDuration: 1000,
      animationEasing: 'cubicOut' as 'cubicOut'
    };

    chart.setOption(option);
    window.addEventListener('resize', function () {
      chart.resize();  // Make chart responsive on window resize
    });


  }







  initBarChart(): void {
    const chartDom = document.getElementById('barChart') as HTMLElement;
    const chart = echarts.init(chartDom);

    const option = {
      title: {
        text: 'Fees Overview',
        left: '3.5%',
        top: 20,
        textStyle: {
          color: '#2c343c',
          fontSize: 16,
          fontWeight: 'bold',
        }
      },
      tooltip: {
        trigger: 'axis',
        formatter: function (params: any) {
          const param = params[0];
          return `${param.name} <br/> ${param.marker}  ₹${param.value}`;
        },
        axisPointer: {
          type: 'shadow'
        },
        textStyle: {
          color: '#2c343c',
          fontSize: 12,
        }
      },
      grid: {
        top: 100,  // Increase this value to give more space under the title
        left: '5%',
        right: '5%',
        bottom: '3%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: ['Total Fees', 'Paid Fees', 'Due Fees'],
        axisLine: {
          lineStyle: {
            color: '#2c343c'
          }
        },
        axisTick: {
          show: false
        }
      },
      yAxis: {
        type: 'value',
        axisLine: {
          lineStyle: {
            color: '#2c343c'
          }
        },
        splitLine: {
          lineStyle: {
            type: 'dashed'
          }
        },
        axisLabel: {
          formatter: function (value: number) {
            return '₹' + value;
          }
        }
      },
      series: [
        {
          name: 'Fees',
          type: 'bar',
          data: [
            { value: this.totalFeesSum, itemStyle: { color: '#8C52FF' } },
            { value: this.paidFeesSum, itemStyle: { color: '#00c57d' } },
            { value: this.dueFeesSum, itemStyle: { color: '#d0cdff' } },
          ],
          barWidth: '50%',
        }
      ],
      backgroundColor: '#fff',
      animationDuration: 1000,
      animationEasing: 'cubicOut' as 'cubicOut'
    };

    chart.setOption(option);
    window.addEventListener('resize', function () {
      chart.resize();  // Make chart responsive on window resize
    });
  }


  filterSession(selectedSession: any) {
    this.selectedSession = selectedSession;
    this.feesCollectionBySession(this.adminId, selectedSession);
  }



  feesCollectionBySession(adminId: string, session: string) {
    let params = {
      adminId: adminId,
      session: session
    }
    this.feesService.feesCollectionBySession(params).subscribe((res: any) => {
      if (res) {
        this.totalFeesSum = res.totalFeesSum;
        this.paidFeesSum = res.paidFeesSum;
        this.dueFeesSum = res.dueFeesSum;
        this.monthlyFeesCollection = res.monthlyPaymentFees;
        this.initPieChart();
        this.initBarChart();
        this.initBarCharts();
      }
    })
  }
  studentCount() {
    let params = {
      adminId: this.adminId
    }
    this.studentService.getStudentCount(params).subscribe((res: any) => {
      this.studentCountInfo = res.countStudent;
    })
  }
  teacherCount() {
    let params = {
      adminId: this.adminId
    }
    this.teacherService.getTeacherCount(params).subscribe((res: any) => {
      this.teacherCountInfo = res.countTeacher;
    })
  }

  marksheetCount() {
    let params = {
      adminId: this.adminId
    }
    this.examResultService.geteExamResultCount(params).subscribe((res: any) => {
      this.marksheetCountInfo = res.countExamResult;
    })
  }
  remainingWhatsappMessageCount() {
    let params = {
      adminId: this.adminId
    }
    this.messageWalletService.getRemainingWhatsappMessageCount(params).subscribe((res: any) => {
      this.remainingWhatsappMessageCountInfo = res.countRemainingWhatsappMessage;
    })
  }
  transferCertificateCount() {
    let params = {
      adminId: this.adminId
    }
    this.issuedTransferCertificateService.getIssuedTransferCertificateCount(params).subscribe((res: any) => {
      this.transferCertificateCountInfo = res.countIssuedTransferCertificate;
    })
  }
}

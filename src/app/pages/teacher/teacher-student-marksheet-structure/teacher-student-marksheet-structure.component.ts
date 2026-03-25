import { Component, Inject, OnInit, PLATFORM_ID, AfterViewInit, ElementRef } from '@angular/core';
declare var jQuery: any;
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormGroup, FormBuilder, Validators, FormArray } from '@angular/forms';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ClassSubjectService } from 'src/app/services/class-subject.service';
import { ExamResultStructureService } from 'src/app/services/exam-result-structure.service';
import { TeacherAuthService } from 'src/app/services/auth/teacher-auth.service';
import { TeacherService } from 'src/app/services/teacher.service';
import { ToastrService } from 'ngx-toastr';


@Component({
  selector: 'app-teacher-student-marksheet-structure',
  templateUrl: './teacher-student-marksheet-structure.component.html',
  styleUrls: ['./teacher-student-marksheet-structure.component.css']
})
export class TeacherStudentMarksheetStructureComponent implements OnInit {
  private isBrowser: boolean = isPlatformBrowser(this.platformId);
  examResultForm: FormGroup;
  disabled = true;
  showModal: boolean = false;
  updateMode: boolean = false;
  deleteMode: boolean = false;
  deleteById: String = '';
  errorMsg: String = '';
  errorCheck: Boolean = false;
  marksheetTemplate: any;
  marksheetSelectMode: boolean = true;
  selectedTemplate: string = '';
  examResultInfo: any;
  processedTheoryData: any[] = [];
  processedPracticalData: any[] = [];
  cls: any;
  stream: any;
  streamMainSubject: any[] = ['mathematics(science)', 'biology(science)', 'history(arts)', 'sociology(arts)', 'political science(arts)', 'accountancy(commerce)', 'economics(commerce)', 'agriculture', 'home science'];
  loader: Boolean = true;
  isChecked!: Boolean;
  createdBy: String = '';
  adminId: string = '';
  teacherInfo: any;

  // Add submission state management property
  isClick: boolean = false;

  availableTemplates = [
    { name: 'T1', url: 'https://res.cloudinary.com/dcx9ttjuo/image/upload/v1772990587/T1_n2mif8.jpg' },
    { name: 'T2', url: 'https://res.cloudinary.com/dcx9ttjuo/image/upload/v1772990603/T2_jtwvgd.jpg' },
    { name: 'T3', url: 'https://res.cloudinary.com/dcx9ttjuo/image/upload/v1772990623/T3_jhe49o.jpg' },
    { name: 'T4', url: 'https://res.cloudinary.com/dcx9ttjuo/image/upload/v1772990647/T4_lhyeow.jpg' },
    { name: 'T5', url: 'https://res.cloudinary.com/dcx9ttjuo/image/upload/v1772990661/T5_e8x7fw.jpg' },
    { name: 'T6', url: 'https://res.cloudinary.com/dcx9ttjuo/image/upload/v1772990676/T6_bte51v.jpg' },
    { name: 'T7', url: 'https://res.cloudinary.com/dcx9ttjuo/image/upload/v1772990701/T7_q5dgco.jpg' },
    { name: 'T8', url: 'https://res.cloudinary.com/dcx9ttjuo/image/upload/v1772990722/T8_u8jaze.jpg' }
  ];

  constructor(@Inject(PLATFORM_ID) private platformId: Object, private el: ElementRef, private fb: FormBuilder, public activatedRoute: ActivatedRoute, private toastr: ToastrService, private adminAuthService: AdminAuthService, private teacherAuthService: TeacherAuthService, private teacherService: TeacherService, private classSubjectService: ClassSubjectService, private examResultStructureService: ExamResultStructureService) {
    this.examResultForm = this.fb.group({
      adminId: [''],
      class: [''],
      stream: [''],
      templateName: ['', Validators.required],
      templateUrl: ['', Validators.required],
      createdBy: ['']
    });
  }

  ngOnInit(): void {
    this.teacherInfo = this.teacherAuthService.getLoggedInTeacherInfo();
    this.adminId = this.teacherInfo?.adminId;
    if (this.teacherInfo) {
      this.getTeacherById(this.teacherInfo)
    }
    this.cls = this.activatedRoute.snapshot.paramMap.get('class');
    this.stream = this.activatedRoute.snapshot.paramMap.get('stream');
    if (this.cls && this.stream) {
      this.getSingleClassMarksheetTemplateByStream(this.cls);
      setTimeout(() => {
        this.loader = false;
      }, 1000);
    } else {
      this.loader = false;
    }
  }

  getTeacherById(teacherInfo: any) {
    let params = {
      adminId: teacherInfo.adminId,
      teacherUserId: teacherInfo.id,
    }
    this.teacherService.getTeacherById(params).subscribe((res: any) => {
      if (res) {
        this.createdBy = `${res.name} (${res.teacherUserId})`;
      }
    })
  }

  ngAfterViewInit() {
    this.initiateCarousel();
  }

  initiateCarousel() {
    if (this.isBrowser) {
      setTimeout(() => {
        jQuery(this.el.nativeElement).find('.template-carousel').owlCarousel({
          stagePadding: 15,
          items: 1,
          loop: false,
          dots: false,
          nav: true,
          responsiveClass: true,
          navText: [
            "<button style='position:absolute;left:-10px;background:#8c88ff3d;color:#4e4caacd;border:none;border-radius:50%;width:30px;height:30px;top:50%;transform:translateY(-50%);'><mat-icon style='margin-top:2px;margin-left:-3px;' class='material-icons'>keyboard_arrow_left</mat-icon></button>",
            "<button style='position:absolute;right:-10px;background:#8c88ff3d;color:#4e4caacd;border:none;border-radius:50%;width:30px;height:30px;top:50%;transform:translateY(-50%);'><mat-icon style='margin-top:2px;margin-left:-3px;' class='material-icons'>keyboard_arrow_right</mat-icon></button>"
          ],
          responsive: {
            600: {
              stagePadding: 20,
              items: 3,
            },
            1500: {
              stagePadding: 50,
              items: 2,
            },
          }
        });
      }, 500);
    }
  }

  addExamResultModel(template: any, templateUrl: any) {
    this.showModal = true;
    this.examResultForm.reset();
    this.examResultForm.get('templateName')?.setValue(template);
    this.examResultForm.get('templateUrl')?.setValue(templateUrl);
    this.selectedTemplate = template;
    // Reset loading state
    this.isClick = false;
    this.errorCheck = false;
    this.errorMsg = '';
  }

  openExamResultStructureModal(examResult: any) {
    this.examResultInfo = examResult;
  }

  deleteMarksheetTemplateModel(id: String) {
    this.showModal = true;
    this.deleteMode = true;
    this.deleteById = id;
    // Reset loading state
    this.isClick = false;
    this.errorCheck = false;
    this.errorMsg = '';
  }

  falseFormValue() {
    this.examResultForm.reset();
  }

  falseAllValue() {
    this.falseFormValue();
  }

  closeModal() {
    this.falseAllValue();
    this.showModal = false;
    this.errorMsg = '';
    this.deleteMode = false;
    this.deleteById = '';
    this.examResultInfo = null;
    this.processedTheoryData = [];
    this.processedPracticalData = [];
    this.examResultForm.reset();
    this.disabled = true;
    // Reset loading state
    this.isClick = false;
    this.errorCheck = false;
  }

  successDone(msg: any) {
    this.closeModal();
    this.getSingleClassMarksheetTemplateByStream(this.cls);
    setTimeout(() => {
      this.toastr.success('', msg);
    }, 500)
  }

  getSingleClassMarksheetTemplateByStream(cls: any) {
    let params = {
      adminId: this.adminId,
      cls: cls,
      stream: this.stream,
    }
    this.examResultStructureService.getSingleClassMarksheetTemplateByStream(params).subscribe((res: any) => {
      if (res) {
        this.marksheetTemplate = res;
        this.marksheetSelectMode = false;
      } else {
        this.marksheetTemplate = null;
        this.marksheetSelectMode = true;
        this.initiateCarousel();
      }
    }, err => {
      this.marksheetTemplate = null;
      this.marksheetSelectMode = true;
      this.initiateCarousel();
    })
  }

  examResultAddUpdate() {
    // Check if already submitting
    if (this.isClick) {
      return;
    }

    // Reset error state and set loading state
    this.errorCheck = false;
    this.errorMsg = '';
    this.isClick = true;
    this.disabled = false;

    this.examResultForm.value.adminId = this.adminId;
    this.examResultForm.value.class = this.cls;
    this.examResultForm.value.stream = this.stream;
    this.examResultForm.value.createdBy = this.createdBy;

    this.examResultStructureService.addExamResultStructure(this.examResultForm.value).subscribe((res: any) => {
      if (res) {
        this.isClick = false;
        this.successDone(res);
      }
    }, err => {
      this.errorCheck = true;
      this.errorMsg = err.error || 'An error occurred while setting marksheet template.';
      this.isClick = false;
    })
  }

  marksheetTemplateDelete(id: String) {
    // Check if already processing delete
    if (this.isClick) {
      return;
    }

    this.isClick = true;

    this.examResultStructureService.deleteResultStructure(id).subscribe((res: any) => {
      if (res) {
        this.isClick = false;
        this.disabled = true;
        this.marksheetSelectMode = true;
        this.marksheetTemplate = null;
        this.initiateCarousel();
        this.successDone(res);
        this.deleteById = '';
      }
    }, (err) => {
      this.errorCheck = true;
      this.errorMsg = err.error || 'An error occurred while deleting marksheet template.';
      this.isClick = false;
    })
  }
}
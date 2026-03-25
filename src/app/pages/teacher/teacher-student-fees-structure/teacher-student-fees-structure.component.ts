import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormGroup, FormBuilder, Validators, FormArray } from '@angular/forms';
import { MatRadioChange } from '@angular/material/radio';
import { FeesStructureService } from 'src/app/services/fees-structure.service';
import { SchoolService } from 'src/app/services/school.service';
import { AcademicSessionService } from 'src/app/services/academic-session.service';
import { ClassService } from 'src/app/services/class.service';
import { TeacherAuthService } from 'src/app/services/auth/teacher-auth.service';
import { TeacherService } from 'src/app/services/teacher.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-teacher-student-fees-structure',
  templateUrl: './teacher-student-fees-structure.component.html',
  styleUrls: ['./teacher-student-fees-structure.component.css']
})
export class TeacherStudentFeesStructureComponent implements OnInit {
  disabled = true;
  cls: number = 0;
  feesForm: FormGroup;
  showModal: boolean = false;
  showFeesStructureModal: boolean = false;
  deleteMode: boolean = false;
  updateMode: boolean = false;
  deleteById: String = '';
  errorMsg: String = '';
  errorCheck: Boolean = false;

  totalFees: number = 0;

  selectedFeesType: any[] = [];
  feesTypeMode: boolean = false;
  feesMode: boolean = false;
  clsFeesStructure: any;
  particularsAdmissionFees: any[] = [];
  singleFessStructure: any;
  feePerticulars: any[] = ['Registration', 'Tution', 'Books', 'Uniform', 'Examination', 'Sports', 'Library', 'Transport'];
  classInfo: any[] = [];
  stream: string = '';
  notApplicable: string = "stream";
  streamMainSubject: any[] = ['mathematics(science)', 'biology(science)', 'history(arts)', 'sociology(arts)', 'political science(arts)', 'accountancy(commerce)', 'economics(commerce)', 'agriculture', 'home science'];
  schoolInfo: any;
  loader: Boolean = true;
  adminId!: string;
  academicSession: string = '';
  allSession: any = [];
  selectedSession: string = '';
  teacherInfo: any;
  
  // Add loading state management properties
  isClick: boolean = false;
  
  constructor(
    private fb: FormBuilder, 
    public activatedRoute: ActivatedRoute, 
    private toastr: ToastrService, 
    private academicSessionService: AcademicSessionService, 
    private teacherAuthService: TeacherAuthService, 
    private teacherService: TeacherService, 
    private schoolService: SchoolService, 
    private classService: ClassService, 
    private feesStructureService: FeesStructureService
  ) {
    this.feesForm = this.fb.group({
      adminId: [''],
      session: [''],
      class: [''],
      stream: [''],
      admissionFees: ['', Validators.required],
      type: this.fb.group({
        feesType: this.fb.array([], [Validators.required]),
      }),
    });
  }

  ngOnInit(): void {
    this.teacherInfo = this.teacherAuthService.getLoggedInTeacherInfo();
    this.adminId = this.teacherInfo?.adminId;
    this.getAcademicSession();
    if (this.teacherInfo) {
      this.getTeacherById(this.teacherInfo);
    }
    this.loader = false;
  }

  getAcademicSession() {
    this.academicSessionService.getAcademicSession().subscribe((res: any) => {
      if (res) {
        this.selectedSession = res.academicSession;
        this.allSession = res.allSession;
        this.getFeesStructureBySession(this.adminId, this.selectedSession);
      }
    });
  }

  onChange(event: MatRadioChange) {
    this.selectedSession = event.value;
    this.getFeesStructureBySession(this.adminId, event.value);
  }

  getTeacherById(teacherInfo: any) {
    let params = {
      adminId: teacherInfo.adminId,
      teacherUserId: teacherInfo.id,
    };
    this.teacherService.getTeacherById(params).subscribe((res: any) => {
      if (res) {
        this.classInfo = res.feeCollectionPermission.classes;
        // Refresh fee structure list after getting permitted classes
        if (this.selectedSession) {
          this.getFeesStructureBySession(this.adminId, this.selectedSession);
        }
      }
    });
  }

  filterSession(selectedSession: any) {
    this.errorCheck = true;
    this.errorMsg = '';
    this.selectedSession = selectedSession;
    this.getFeesStructureBySession(this.adminId, selectedSession);
  }

  chooseClass(cls: any) {
    this.errorCheck = true;
    this.errorMsg = '';
    this.cls = cls;
    if (cls !== 11 && cls !== 12) {
      this.stream = this.notApplicable;
      this.feesForm.get('class')?.setValue(cls);
      this.feesForm.get('stream')?.setValue("n/a");
    }
    if (cls == 11 || cls == 12) {
      this.feesForm.get('class')?.setValue(cls);
      if (this.stream == 'stream') {
        this.stream = '';
      }
    }
  }

  filterStream(stream: any) {
    this.errorCheck = true;
    this.errorMsg = '';
    this.stream = stream;
    if (stream && this.cls) {
      this.feesForm.get('stream')?.setValue(stream);
    }
  }

  getFeesStructureBySession(adminId: string, session: string) {
    let params = {
      adminId: adminId,
      session: session
    };
    this.feesStructureService.feesStructureBySession(params).subscribe((res: any) => {
      if (res) {
        this.errorMsg = '';
        // Filter fee structures based on teacher's permitted classes
        if (this.classInfo && this.classInfo.length > 0) {
          this.clsFeesStructure = res.filter((feeStructure: any) => 
            this.classInfo.includes(feeStructure.class)
          );
        } else {
          this.clsFeesStructure = [];
        }
      }
    }, err => {
      this.errorMsg = err.error;
    });
  }

  addFeesModel() {
    this.showModal = true;
    this.feesTypeMode = true;
    // Reset loading states
    this.isClick = false;
  }

  openFeesStructureModal(singleFessStructure: any) {
    this.singleFessStructure = singleFessStructure;
    this.particularsAdmissionFees = [{ Admission: singleFessStructure.admissionFees }, ...singleFessStructure.feesType];
    this.showFeesStructureModal = true;
  }

  selectFeesStructure() {
    if (this.selectedSession == '') {
      this.errorCheck = true;
      this.errorMsg = 'Session is required';
      return;
    }
    if (this.cls == 0) {
      this.errorCheck = true;
      this.errorMsg = 'Class is required';
      return;
    }
    if (this.stream == '') {
      this.errorCheck = true;
      this.errorMsg = 'Stream is required';
      return;
    }
    this.feesTypeMode = false;
    this.feesMode = true;
    this.patch();
  }

  falseAllValue() {
    this.totalFees = 0;
    this.selectedFeesType = [];
    const controlOne = <FormArray>this.feesForm.get('type.feesType');
    controlOne.clear();
    this.feesTypeMode = false;
    this.feesMode = false;
  }

  closeModal() {
    this.falseAllValue();
    this.showModal = false;
    this.deleteMode = false;
    this.errorMsg = '';
    this.errorCheck = false;
    this.particularsAdmissionFees = [];
    this.showFeesStructureModal = false;
    this.feesForm.reset();
    // Reset loading states
    this.isClick = false;
  }

  deleteFeesStructureModel(id: String) {
    this.showModal = true;
    this.deleteMode = true;
    this.deleteById = id;
    // Reset loading states
    this.isClick = false;
  }

  successDone(msg: any) {
    this.getFeesStructureBySession(this.adminId, this.selectedSession);
    this.closeModal();
    setTimeout(() => {
      this.toastr.success('', msg);
    }, 500);
  }

  feesType(option: any) {
    const index = this.selectedFeesType.indexOf(option);
    if (index > -1) {
      this.selectedFeesType.splice(index, 1);
    } else {
      this.selectedFeesType.push(option);
    }
  }

  patch() {
    const controlOne = <FormArray>this.feesForm.get('type.feesType');
    this.selectedFeesType.forEach((x: any) => {
      controlOne.push(this.patchFeesTypeValues(x));
    });
  }

  patchFeesTypeValues(selectedFeesType: any) {
    return this.fb.group({
      [selectedFeesType]: ['', Validators.required]
    });
  }

  // Helper method to mark all form fields as touched for validation display
  private markFormGroupTouched() {
    Object.keys(this.feesForm.controls).forEach(key => {
      const control = this.feesForm.get(key);
      control?.markAsTouched();
    });
    
    // Also mark nested form controls as touched
    const typeGroup = this.feesForm.get('type') as FormGroup;
    if (typeGroup) {
      Object.keys(typeGroup.controls).forEach(key => {
        const control = typeGroup.get(key);
        control?.markAsTouched();
      });
    }
    
    const feesTypeArray = this.feesForm.get('type.feesType') as FormArray;
    if (feesTypeArray) {
      feesTypeArray.controls.forEach(control => {
        const formGroup = control as FormGroup;
        Object.keys(formGroup.controls).forEach(key => {
          const nestedControl = formGroup.get(key);
          nestedControl?.markAsTouched();
        });
      });
    }
  }

  feesStructureAddUpdate() {
    // Check if already submitting
    if (this.isClick) {
      return;
    }

    // Validate form
    if (!this.feesForm.valid) {
      this.markFormGroupTouched();
      this.errorCheck = true;
      this.errorMsg = 'Please fill all required fields correctly.';
      return;
    }

    this.feesForm.value.adminId = this.adminId;
    this.feesForm.value.session = this.selectedSession;
    this.feesForm.value.totalFees = this.totalFees;
    let feesTypeObj = this.feesForm.value.type.feesType;
    let containsFeesTypeNull = feesTypeObj.some((item: any) => Object.values(item).includes(null) || Object.values(item).includes(''));
    
    if (containsFeesTypeNull) {
      this.errorCheck = true;
      this.errorMsg = 'Please fill all fields';
      return;
    }
    
    // Set loading state
    this.errorCheck = false;
    this.errorMsg = '';
    this.isClick = true;

    this.feesStructureService.addFeesStructure(this.feesForm.value).subscribe(
      (res: any) => {
        if (res) {
          this.isClick = false;
          this.successDone(res);
        }
      }, 
      err => {
        this.errorCheck = true;
        this.errorMsg = err.error || 'An error occurred while processing fee structure.';
        this.isClick = false;
      }
    );
  }

  feesStructureDelete(id: String) {
    // Check if already deleting
    if (this.isClick) {
      return;
    }

    this.isClick = true;
    this.errorCheck = false;
    this.errorMsg = '';

    this.feesStructureService.deleteFeesStructure(id).subscribe(
      (res: any) => {
        if (res) {
          this.isClick = false;
          this.getFeesStructureBySession(this.adminId, this.selectedSession);
          this.successDone(res);
          this.deleteById = '';
        }
      }, 
      err => {
        this.errorCheck = true;
        this.errorMsg = err.error || 'An error occurred while deleting fee structure.';
        this.isClick = false;
      }
    );
  }
}
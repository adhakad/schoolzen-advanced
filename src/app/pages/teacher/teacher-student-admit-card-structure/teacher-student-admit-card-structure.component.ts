import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormGroup, FormBuilder, Validators, FormArray } from '@angular/forms';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ClassSubjectService } from 'src/app/services/class-subject.service';
import { AdmitCardStructureService } from 'src/app/services/admit-card-structure.service';
import { ClassService } from 'src/app/services/class.service';
import { TeacherAuthService } from 'src/app/services/auth/teacher-auth.service';
import { TeacherService } from 'src/app/services/teacher.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-teacher-student-admit-card-structure',
  templateUrl: './teacher-student-admit-card-structure.component.html',
  styleUrls: ['./teacher-student-admit-card-structure.component.css']
})
export class TeacherStudentAdmitCardStructureComponent implements OnInit {
  cls: number = 0;
  admitcardForm: FormGroup;
  showModal: boolean = false;
  showAdmitCardStructureModal: boolean = false;
  updateMode: boolean = false;
  deleteMode: boolean = false;
  deleteById: String = '';
  errorMsg: string = '';
  errorCheck: Boolean = false;
  classSubject: any[] = [];
  examAdmitCard: any;
  admitCardInfo: any;
  processedData: any[] = [];
  classInfo: any[] = [];
  teacherInfo: any;
  stream: string = '';
  streamMainSubject: any[] = ['mathematics(science)', 'biology(science)', 'history(arts)', 'sociology(arts)', 'political science(arts)', 'accountancy(commerce)', 'economics(commerce)', 'agriculture', 'home science'];
  allExamType: any;
  examTime: any[] = ["8:00 AM", "8:30 AM", "9:00 AM", "9:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM", "12:00 PM", "12:30 PM", "01:00 PM", "01:30 PM", "02:00 PM", "02:30 PM", "03:00 PM", "03:30 PM", "04:00 PM"];
  loader: Boolean = true;
  adminId!: string;
  editData: any;
  
  // Add submission state management property
  isClick: boolean = false;

  constructor(private fb: FormBuilder, public activatedRoute: ActivatedRoute, private toastr: ToastrService, private adminAuthService: AdminAuthService, private teacherAuthService: TeacherAuthService, private teacherService: TeacherService, private classSubjectService: ClassSubjectService, private admitCardStructureService: AdmitCardStructureService) {
    this.admitcardForm = this.fb.group({
      adminId: [''],
      class: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
      stream: ['', Validators.required],
      examType: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(20)]],
      type: this.fb.group({
        examDate: this.fb.array([], [Validators.required]),
        startTime: this.fb.array([], [Validators.required]),
        endTime: this.fb.array([], [Validators.required]),
      }),
    });
  }

  ngOnInit(): void {
    this.teacherInfo = this.teacherAuthService.getLoggedInTeacherInfo();
    this.adminId = this.teacherInfo?.adminId;
    if (this.teacherInfo) {
      this.getTeacherById(this.teacherInfo)
    }
    this.getAdmitCardStructureByClass();
    this.allOptions();
  }

  getTeacherById(teacherInfo: any) {
    let params = {
      adminId: teacherInfo.adminId,
      teacherUserId: teacherInfo.id,
    }
    this.teacherService.getTeacherById(params).subscribe((res: any) => {
      if (res) {
        this.classInfo = res.admitCardPermission.classes;
      }
    })
  }

  chooseClass(cls: any) {
    this.errorCheck = false;
    this.errorMsg = '';
    this.cls = 0;
    this.cls = cls;
    this.classSubject = [];
    if (cls < 11 && cls !== 0 || cls == 200 || cls == 201 || cls == 202) {
      this.admitcardForm.get('stream')?.setValue("n/a");
      this.stream = '';
      this.stream = 'stream';
      if (this.cls && this.stream) {
        let params = {
          cls: this.cls,
          stream: this.stream,
          adminId: this.adminId,
          patchValueMode: true
        }
        this.getSingleClassSubjectByStream(params);
      }
    }
  }

  chooseStream(stream: any) {
    this.stream = '';
    this.stream = stream;
    if (this.cls && this.stream) {
      let params = {
        cls: this.cls,
        stream: this.stream,
        adminId: this.adminId,
        patchValueMode: true
      }
      this.getSingleClassSubjectByStream(params);
    }
  }

  falseFormValue() {
    const controlOne = <FormArray>this.admitcardForm.get('type.examDate');
    const controlTwo = <FormArray>this.admitcardForm.get('type.startTime');
    const controlThree = <FormArray>this.admitcardForm.get('type.endTime');
    controlOne.clear();
    controlTwo.clear();
    controlThree.clear();
    this.admitcardForm.reset();
  }

  falseAllValue() {
    this.falseFormValue();
    this.classSubject = [];
    this.admitcardForm.reset();
    this.updateMode = false;
    this.editData = null;
  }

  getSingleClassSubjectByStream(params: any) {
    this.classSubjectService.getSingleClassSubjectByStream(params).subscribe((res: any) => {
      if (res) {
        this.classSubject = res.subject;
        if (this.classSubject && params.patchValueMode == true) {
          this.patch();
        }
      }
      if (!res) {
        this.classSubject = [];
      }
    }, err => {
      this.errorCheck = true;
      if (err.status == 404) {
        this.errorMsg = err.error
      }
    })
  }

  getAdmitCardStructureByClass() {
    let params = {
      cls: this.cls,
      adminId: this.adminId,
      stream: this.stream,
    }
    this.admitCardStructureService.admitCardStructureByClass(params).subscribe((res: any) => {
      if (res) {
        this.examAdmitCard = res;
        this.loader = false;
      }
    }, err => {
      if (err.status == 404) {
      }
    })
  }

  processData(examAdmitCard: any) {
    for (let i = 0; i < examAdmitCard.examDate.length; i++) {
      const subject = Object.keys(examAdmitCard.examDate[i])[0];
      const date = Object.values(examAdmitCard.examDate[i])[0];
      const startTime = Object.values(examAdmitCard.examStartTime[i])[0];
      const endTime = Object.values(examAdmitCard.examEndTime[i])[0];

      this.processedData.push({
        subject,
        date,
        timing: `${startTime} to ${endTime}`
      });
    }
  }

  addAdmitCardModel() {
    this.showModal = true;
    this.updateMode = false;
    this.editData = null;
    // Reset loading state
    this.isClick = false;
  }

  openAdmitCardStructureModal(examAdmitCard: any) {
    this.showAdmitCardStructureModal = true;
    this.admitCardInfo = examAdmitCard;
    this.processData(examAdmitCard);
  }

  deleteAdmitCardStructureModel(id: String) {
    this.showModal = true;
    this.deleteMode = true;
    this.deleteById = id;
    // Reset loading state
    this.isClick = false;
  }

  closeModal() {
    this.showModal = false;
    this.errorMsg = '';
    this.deleteMode = false;
    this.deleteById = '';
    this.showAdmitCardStructureModal = false;
    this.admitCardInfo;
    this.processedData = [];
    this.falseAllValue();
    this.admitcardForm.reset();
    this.updateMode = false;
    this.editData = null;
    // Reset loading state
    this.isClick = false;
  }

  successDone(msg: any) {
    this.closeModal();
    this.getAdmitCardStructureByClass();
    setTimeout(() => {
      this.toastr.success('', msg);
    }, 500)
  }

  patch() {
    const controlOne = <FormArray>this.admitcardForm.get('type.examDate');
    this.classSubject.forEach((x: any) => {
      controlOne.push(this.patchExamDate(x.subject))
    })

    const controlTwo = <FormArray>this.admitcardForm.get('type.startTime');
    this.classSubject.forEach((x: any) => {
      controlTwo.push(this.patchStartTime(x.subject))
    })

    const controlThree = <FormArray>this.admitcardForm.get('type.endTime');
    this.classSubject.forEach((x: any) => {
      controlThree.push(this.patchEndTime(x.subject))
    })
  }

  patchExamDate(examDate: any) {
    return this.fb.group({
      [examDate]: ['', Validators.required,],
    })
  }

  patchStartTime(startTime: any) {
    return this.fb.group({
      [startTime]: ['', Validators.required,],
    })
  }

  patchEndTime(endTime: any) {
    return this.fb.group({
      [endTime]: ['', Validators.required,],
    })
  }

  toMins(t: string): number {
    let [h, m] = t.replace(/ AM| PM/, '').split(':').map(Number);
    if (t.includes('PM') && h !== 12) h += 12;
    if (t.includes('AM') && h === 12) h = 0;
    return h * 60 + m;
  }

  // Helper method to mark all form fields as touched for validation display
  private markFormGroupTouched() {
    Object.keys(this.admitcardForm.controls).forEach(key => {
      const control = this.admitcardForm.get(key);
      control?.markAsTouched();
      
      // Handle nested form groups
      if (control instanceof FormGroup) {
        Object.keys(control.controls).forEach(nestedKey => {
          const nestedControl = control.get(nestedKey);
          nestedControl?.markAsTouched();
          
          // Handle form arrays
          if (nestedControl instanceof FormArray) {
            nestedControl.controls.forEach((arrayControl) => {
              if (arrayControl instanceof FormGroup) {
                Object.keys(arrayControl.controls).forEach(arrayKey => {
                  arrayControl.get(arrayKey)?.markAsTouched();
                });
              }
            });
          }
        });
      }
    });
  }

  admitcardAddUpdate() {
    // Check form validity first
    if (!this.admitcardForm.valid) {
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

    const { startTime, endTime } = this.admitcardForm.value.type;
    for (let i = 0; i < startTime.length; i++) {
      const sub = Object.keys(startTime[i])[0];
      const start = this.toMins(startTime[i][sub]);
      const end = this.toMins(endTime[i][sub]);
      if (start === end) {
        this.errorCheck = true;
        this.errorMsg = `${sub.charAt(0).toUpperCase() + sub.slice(1).toLowerCase()} : Start time and end time cannot be the same!`
        return;
      }
      if (start >= end) {
        this.errorCheck = true;
        this.errorMsg = `${sub.charAt(0).toUpperCase() + sub.slice(1).toLowerCase()} : Start time must be before end time!`
        return;
      }
    }

    // Reset error state and set loading state
    this.errorCheck = false;
    this.errorMsg = '';
    this.isClick = true;

    this.admitcardForm.value.type.examDate = this.admitcardForm.value.type.examDate.map((exam: any) => {
      const subject = Object.keys(exam)[0];
      const dateStr = exam[subject];
      const dateObj = new Date(dateStr);
      const day = String(dateObj.getDate()).padStart(2, '0');
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const year = dateObj.getFullYear();
      const formattedDate = `${day}/${month}/${year}`;
      return { [subject]: formattedDate };
    });
    this.admitcardForm.value.adminId = this.adminId;

    if (this.updateMode) {
      this.admitCardStructureService.updateAdmitCardStructure(this.admitcardForm.value).subscribe((res: any) => {
        if (res) {
          this.isClick = false;
          this.successDone(res);
        }
      }, err => {
        this.errorCheck = true;
        this.errorMsg = err.error || 'An error occurred while updating admit card structure.';
        this.isClick = false;
      });
    } else {
      this.admitCardStructureService.addAdmitCardStructure(this.admitcardForm.value).subscribe((res: any) => {
        if (res) {
          this.isClick = false;
          this.successDone(res);
        }
      }, err => {
        this.errorCheck = true;
        this.errorMsg = err.error || 'An error occurred while creating admit card structure.';
        this.isClick = false;
      });
    }
  }

  onToggleChange(id: any, admitCardPublishStatus: any) {
    let params = {
      id: id,
      admitCardPublishStatus: admitCardPublishStatus
    }
    this.admitCardStructureService.changeAdmitCardPublishStatus(params)
      .subscribe(
        (response: any) => {
        },
        error => {
          console.log(error)
        }
      );
  }

  admitCardStructureDelete(id: String) {
    // Check if already processing delete
    if (this.isClick) {
      return;
    }

    this.isClick = true;

    this.admitCardStructureService.deleteAdmitCardStructure(id).subscribe((res: any) => {
      if (res) {
        this.isClick = false;
        this.successDone(res);
        this.deleteById = '';
      }
    }, (err) => {
      this.errorCheck = true;
      this.errorMsg = err.error || 'An error occurred while deleting admit card structure.';
      this.isClick = false;
    });
  }

  editAdmitCardStructureModel(data: any) {
    this.showModal = true;
    this.updateMode = true;
    this.editData = data;
    this.cls = data.class;
    this.stream = data.stream;
    // Reset loading state
    this.isClick = false;

    if (this.stream == "n/a" || data.stream == "n/a") {
      this.stream = "stream";
    }
    let params = {
      cls: this.cls,
      stream: this.stream,
      adminId: this.adminId,
      patchValueMode: false
    };
    this.getSingleClassSubjectByStream(params);
    this.admitcardForm.patchValue({
      adminId: data.adminId,
      class: data.class,
      stream: data.stream,
      examType: data.examType,
    });
    const examDateControl = this.admitcardForm.get('type.examDate') as FormArray;
    const startTimeControl = this.admitcardForm.get('type.startTime') as FormArray;
    const endTimeControl = this.admitcardForm.get('type.endTime') as FormArray;

    data.examDate.forEach((item: any) => {
      const formattedItem: any = {};

      Object.keys(item).forEach(key => {
        const dateParts = item[key].split('/');
        const isoDate = new Date(`${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`);
        formattedItem[key] = isoDate;
      });

      examDateControl.push(this.fb.group(formattedItem));
    });
    data.examStartTime.forEach((item: any) => {
      startTimeControl.push(this.fb.group(item));
    });
    data.examEndTime.forEach((item: any) => {
      endTimeControl.push(this.fb.group(item));
    });
  }

  allOptions() {
    this.allExamType = [{ examType: 'Quaterly Exam' }, { examType: 'Half Yearly Exam' }, { examType: 'Yearly Exam' }, { examType: 'Final Exam' }, { examType: 'Pre Board Exam' }, { examType: 'Term 1 Exam' }, { examType: 'Term 2 Exam' }]
  }
}
import { Component, OnInit } from '@angular/core';
import { FormGroup, FormBuilder, Validators, FormArray, FormControl } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ExamResultStructureService } from 'src/app/services/exam-result-structure.service';


@Component({
  selector: 'app-admin-student-marksheet-structure-edit',
  templateUrl: './admin-student-marksheet-structure-edit.component.html',
  styleUrls: ['./admin-student-marksheet-structure-edit.component.css']
})
export class AdminStudentMarksheetStructureEditComponent implements OnInit {
  subjectPermissionForm!: FormGroup;
  successMsg: String = '';
  errorMsg: String = '';
  errorCheck: Boolean = false;
  adminId: string = '';
  id: any;
  examStructure: any;
  subjects: any[] = [];
  selectedSubjects: { [key: string]: string[] } = {};
  terms: string[] = [];
  marksTypes: string[] = [];
  marksTypeGroups: { [key: string]: string[] } = {};

  constructor(
    private fb: FormBuilder,
    private activatedRoute: ActivatedRoute,
    private toastr: ToastrService,
    private adminAuthService: AdminAuthService,
    private examResultStructureService: ExamResultStructureService
  ) { 
    this.subjectPermissionForm = this.fb.group({
      _id: [''],
      supplySubjectLimit: ['',Validators.required],
      createdBy: [''],
    });
  }

  ngOnInit(): void {

    const getAdmin = this.adminAuthService.getLoggedInAdminInfo();
    this.adminId = getAdmin?.id;
    this.id = this.activatedRoute.snapshot.paramMap.get('id');
    this.getSingleMarksheetTemplateById();
  }

  getKeys(obj: any): string[] {
    return Object.keys(obj);
  }

  getSingleMarksheetTemplateById() {
    this.examResultStructureService.getSingleMarksheetTemplateById(this.id).subscribe(
      (res: any) => {
        this.examStructure = res.examStructure;
        this.subjects = res.subjects.map((subject: any) => subject.subject);
        this.terms = Object.keys(this.examStructure);
        this.marksTypes = this.getMarksTypes();
        this.subjectPermissionForm.patchValue({ supplySubjectLimit: this.examStructure.term1.supplySubjectLimit });
        this.groupMarksTypes();
        this.initializeSelectedSubjects();
        this.patchForm();
      },
      (err) => {
        this.toastr.error('Failed to fetch marksheet template');
      }
    );
  }

  getMarksTypes(): string[] {
    const allMarksTypes = new Set<string>();
    this.terms.forEach((term) => {
      const marks = Object.keys(this.examStructure[term]?.scholasticMarks || {});
      marks.forEach((type) => allMarksTypes.add(type));
    });
    return Array.from(allMarksTypes);
  }

  groupMarksTypes() {
    this.marksTypes.forEach((marksType) => {
      const baseType = marksType.replace(/MaxMarks|PassMarks/, '');
      if (!this.marksTypeGroups[baseType]) {
        this.marksTypeGroups[baseType] = [];
      }
      this.marksTypeGroups[baseType].push(marksType);
    });
  }

  initializeSelectedSubjects() {
    Object.keys(this.marksTypeGroups).forEach((group) => {
      this.selectedSubjects[group] = [];
      this.terms.forEach(term => {
        this.marksTypeGroups[group].forEach(marksType => {
          const marksArray = this.examStructure[term]?.scholasticMarks?.[marksType] || [];
          marksArray.forEach((item: any) => {
            const subject = Object.keys(item)[0];
            if (!this.selectedSubjects[group].includes(subject)) {
              this.selectedSubjects[group].push(subject);
            }
          });
        });
      });
    });
  }

  patchForm() {
    this.terms.forEach((term) => {
      if (this.subjectPermissionForm.get(term)) {
        this.subjectPermissionForm.removeControl(term);
      }
    });

    this.terms.forEach((term) => {
      const termGroup = this.fb.group({});
      this.subjectPermissionForm.addControl(term, termGroup);

      Object.keys(this.marksTypeGroups).forEach((group) => {
        this.marksTypeGroups[group].forEach((marksType) => {
          termGroup.addControl(marksType, this.fb.array([]));

          const marksControlArray = this.getMarksArray(term, marksType);
          marksControlArray.clear();

          this.selectedSubjects[group].forEach((subject) => {
            marksControlArray.push(
              this.fb.group({
                subject: [subject],
                marks: [
                  this.getDefaultValue(subject, term, marksType),
                  [Validators.required, Validators.min(0), Validators.max(100)]
                ]
              })
            );
          });
        });
      });
    });
  }

  getDefaultValue(subject: string, term: string, marksType: string) {
    return this.examStructure?.[term]?.scholasticMarks?.[marksType]?.find((item: any) => item[subject])?.[subject] || '';
  }

  marksTypeToggle(subject: string, event: any, group: string) {
    if (event.checked) {
      if (!this.selectedSubjects[group].includes(subject)) {
        this.selectedSubjects[group].push(subject);
      }
    } else {
      this.selectedSubjects[group] = this.selectedSubjects[group].filter(s => s !== subject);
    }
    this.patchForm();
  }

  isSubjectSelected(subject: string, group: string): boolean {
    return this.selectedSubjects[group].includes(subject);
  }

  getMarksArray(term: string, marksType: string): FormArray {
    return this.subjectPermissionForm.get(`${term}.${marksType}`) as FormArray;
  }
  successDone(msg: any) {
    this.successMsg = '';
    this.marksTypeGroups = {};
    this.getSingleMarksheetTemplateById();
    setTimeout(() => {
      this.toastr.success('',msg);
    }, 500)
  }
  subjectPermissionAdd() {
    if (this.subjectPermissionForm.valid) {
      this.subjectPermissionForm.value._id = this.id;
      this.subjectPermissionForm.value.createdBy = "Admin";
      this.examResultStructureService.updateMarksheetTemplateStructure(this.subjectPermissionForm.value).subscribe((res: any) => {
        if (res) {
          this.successDone(res);
        }
      }, err => {
        this.errorCheck = true;
        this.errorMsg = err.error;
      })
    }
  }

  markFormGroupTouched(formGroup: FormGroup) {
    Object.values(formGroup.controls).forEach(control => {
      control.markAsTouched();

      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      } else if (control instanceof FormArray) {
        control.controls.forEach(formGroupInsideFormArray => {
          if (formGroupInsideFormArray instanceof FormGroup) {
            this.markFormGroupTouched(formGroupInsideFormArray);
          }
        })
      }
    });
  }
}
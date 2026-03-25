import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormGroup, FormBuilder, Validators, FormArray,AbstractControl } from '@angular/forms';
import { Subject } from 'rxjs';
import { read, utils, writeFile } from 'xlsx';
import { ExamResultService } from 'src/app/services/exam-result.service';
import { PrintPdfService } from 'src/app/services/print-pdf/print-pdf.service'; 
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { StudentService } from 'src/app/services/student.service';
import { ExamResultStructureService } from 'src/app/services/exam-result-structure.service';
import { SchoolService } from 'src/app/services/school.service';
import { ClassService } from 'src/app/services/class.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-admin-student-marksheet-result-add',
  templateUrl: './admin-student-marksheet-result-add.component.html',
  styleUrls: ['./admin-student-marksheet-result-add.component.css']
})
export class AdminStudentMarksheetResultAddComponent implements OnInit {
  examResultForm: FormGroup;
  showModal: boolean = false;
  updateMode: boolean = false;
  deleteMode: boolean = false;
  deleteById: String = '';
  errorMsg: String = '';
  errorCheck: Boolean = false;
  marksheetTemplateStructureInfo: any;
  resultStructureInfo: any;
  allExamResults: any[] = [];
  examResultInfo: any[] = [];
  mappedResults: any[] = [];
  studentInfo: any;
  recordLimit: number = 10;
  filters: any = {};
  number: number = 0;
  paginationValues: Subject<any> = new Subject();
  page: Number = 0;
  cls: any;
  classSubjectList: any;
  selectedValue: number = 0;
  theorySubjects: any[] = [];
  practicalSubjects: any[] = [];
  periodicTestSubjects: any[] = [];
  noteBookSubjects: any[] = [];
  subjectEnrichmentSubjects: any[] = [];
  projectSubjects: any[] = [];
  halfYearlySubjects: any[] = [];
  coScholastic: any[] = [];
  theoryMaxMarks: any;
  practicalMaxMarks: any;
  periodicTestMaxMarks: any;
  noteBookMaxMarks: any;
  subjectEnrichmentMaxMarks: any;
  projectMaxMarks: any;
  halfYearlyMaxMarks: any;
  fileChoose: boolean = false;
  existRollnumber: number[] = [];
  bulkResult: any[] = [];
  selectedExam: any = '';
  selectedRollNumber !: number;
  stream: any;
  notApplicable: String = "stream";
  examType: any[] = [];
  streamMainSubject: any[] = ['mathematics(science)', 'biology(science)', 'history(arts)', 'sociology(arts)', 'political science(arts)', 'accountancy(commerce)', 'economics(commerce)', 'agriculture', 'home science'];
  coScholasticGrades: any[] = ['A', 'B', 'C'];
  loader: Boolean = false;
  adminId!: string;
  
  // Add submission state management property
  isClick: boolean = false;
  
  constructor(private fb: FormBuilder, public activatedRoute: ActivatedRoute, private toastr: ToastrService, private adminAuthService: AdminAuthService, private schoolService: SchoolService, private printPdfService: PrintPdfService, private examResultService: ExamResultService, private classService: ClassService, private examResultStructureService: ExamResultStructureService, private studentService: StudentService) {
    this.examResultForm = this.fb.group({
      adminId: [''],
      rollNumber: [''],
      examType: ['', Validators.required],
      stream: [''],
      class: [''],
      createdBy: [''],
      resultDetail: [''],
      type: this.fb.group({
        theoryMarks: this.fb.array([]),
        practicalMarks: this.fb.array([]),
        periodicTestMarks: this.fb.array([]),
        noteBookMarks: this.fb.array([]),
        subjectEnrichmentMarks: this.fb.array([]),
        projectMarks: this.fb.array([]),
        halfYearlyMarks: this.fb.array([]),
        coScholastic: this.fb.array([]),
      }),
    });
  }
  ngOnInit(): void {
    let getAdmin = this.adminAuthService.getLoggedInAdminInfo();
    this.adminId = getAdmin?.id;
    this.cls = this.activatedRoute.snapshot.paramMap.get('class');
    this.stream = this.activatedRoute.snapshot.paramMap.get('stream');
    if (this.stream && this.cls) {
      let params = {
        adminId: this.adminId,
        cls: this.cls,
        stream: this.stream,
      }
      this.getStudentExamResultByClassStream(params);
      this.getSingleClassResultStrucByStream(params);
    }
  }
  addExamResultModel(rollnumber: number) {
    this.showModal = true;
    this.deleteMode = false;
    this.updateMode = false;
    this.examResultForm.reset();
    this.errorCheck = false;
    this.errorMsg = '';
    this.isClick = false; // Reset loading state
    if (rollnumber !== 0) {
      this.selectedRollNumber = rollnumber;
    }
  }
  deleteExamResultModel(id: String) {
    this.showModal = true;
    this.updateMode = false;
    this.deleteMode = true;
    this.deleteById = id;
    this.errorCheck = false;
    this.errorMsg = '';
    this.isClick = false; // Reset loading state
  }

  falseFormValue() {
    const controlOne = <FormArray>this.examResultForm.get('type.theoryMarks');
    const controlTwo = <FormArray>this.examResultForm.get('type.practicalMarks');
    const controlThree = <FormArray>this.examResultForm.get('type.periodicTestMarks');
    const controlFour = <FormArray>this.examResultForm.get('type.noteBookMarks');
    const controlFive = <FormArray>this.examResultForm.get('type.subjectEnrichmentMarks');
    const controlSix = <FormArray>this.examResultForm.get('type.projectMarks');
    const controlSeven = <FormArray>this.examResultForm.get('type.halfYearlyMarks');
    const controlEight = <FormArray>this.examResultForm.get('type.coScholastic');
    controlOne.clear();
    controlTwo.clear();
    controlThree.clear();
    controlFour.clear();
    controlFive.clear();
    controlSix.clear();
    controlSeven.clear();
    controlEight.clear();
  }
  falseAllValue() {
    this.falseFormValue();
    this.practicalSubjects = [];
    this.periodicTestSubjects = [];
    this.noteBookSubjects = [];
    this.subjectEnrichmentSubjects = [];
    this.projectSubjects = [];
    this.halfYearlySubjects = [];
    this.theorySubjects = [];
    this.coScholastic = [];
  }

  closeModal() {
    this.falseAllValue();
    this.updateMode = false;
    this.deleteMode = false;
    this.errorMsg = '';
    this.errorCheck = false;
    this.selectedExam = '';
    this.examResultForm.reset();
    this.showModal = false;
    this.isClick = false; // Reset loading state
    if (this.stream && this.cls) {
      let params = {
        adminId: this.adminId,
        cls: this.cls,
        stream: this.stream,
      }
      this.getStudentExamResultByClassStream(params);
      this.getSingleClassResultStrucByStream(params);
    }
  }

  successDone(msg: any) {
    this.closeModal();
    if (this.stream && this.cls) {
      let params = {
        adminId: this.adminId,
        cls: this.cls,
        stream: this.stream,
      }
      this.getStudentExamResultByClassStream(params);
      this.getSingleClassResultStrucByStream(params);
    }
    setTimeout(() => {
      this.toastr.success('',msg);
    }, 500)
  }

  getStudentExamResultByClassStream(params: any) {
    let param = {
      class: params.cls,
      stream: params.stream,
      adminId: this.adminId,
    }
    this.examResultService.getAllStudentExamResultByClassStream(param).subscribe((res: any) => {
      if (res) {
        this.examResultInfo = res.examResultInfo;
        this.studentInfo = res.studentInfo;
        if (res.examResultInfo == 0) {
          this.examResultInfo = [];
          this.examResultInfo = res.studentInfo;
        }

        let isDate = res.isDate;
        let marksheetTemplateStructure = res.marksheetTemplateStructure;
        let examType = Object.keys(marksheetTemplateStructure.examStructure);
        const mapExamResultsToStudents = (studentInfo: any) => {
          return studentInfo.map((student: any) => {

            let exams: any = {};

            let resultDetail = res.examResultInfo == 0 ? this.examResultInfo.find(info => info._id === student._id)?.resultDetail || {} : this.examResultInfo.find(info => info.studentId === student._id)?.resultDetail || {};

            examType.forEach((exam: any) => {
              exams[exam] = resultDetail[exam] ? "present" : "empty";
            });
            return {
              session: student.session,
              adminId: student.adminId,
              studentId: student._id,
              class: student.class,
              stream: student.stream,
              dob: student.dob,
              marksheetTemplateStructure: marksheetTemplateStructure,
              examType: examType,
              examTypeResultExist: examType.map((exam: any) => exams[exam]),
              name: student.name,
              fatherName: student.fatherName,
              motherName: student.motherName,
              rollNumber: student.rollNumber,
              admissionNo: student.admissionNo,
              isDate: isDate,
            };
          });
        };

        this.mappedResults = mapExamResultsToStudents(this.studentInfo);
      }
    }, err => {
    })
    setTimeout(() => {
      this.loader = false;
    }, 1000);
  }

  selectExam(selectedExam: string) {
    if (this.theorySubjects || this.practicalSubjects || this.periodicTestSubjects || this.noteBookSubjects || this.subjectEnrichmentSubjects || this.projectSubjects || this.halfYearlySubjects) {
      this.falseAllValue();
    }
    this.selectedExam = selectedExam;
    const examFilteredData = this.marksheetTemplateStructureInfo.marksheetTemplateStructure.examStructure[selectedExam];
    let subjects = this.marksheetTemplateStructureInfo.classSubjectList.subject;
    this.practicalSubjects = [];
    this.periodicTestSubjects = [];
    this.noteBookSubjects = [];
    this.subjectEnrichmentSubjects = [];
    this.projectSubjects = [];
    this.halfYearlySubjects = [];
    this.coScholastic = [];
    if (examFilteredData.scholasticMarks.theoryMaxMarks) {
      this.theorySubjects = examFilteredData.scholasticMarks.theoryMaxMarks.map((item: any) => {
        const theorySubject = Object.keys(item)[0];
        return theorySubject;
      })
      if (this.theorySubjects) {
        this.theoryMaxMarks = examFilteredData.scholasticMarks.theoryMaxMarks;
        console.log(this.theoryMaxMarks)
        this.patchTheory();
      }
    }
    if (examFilteredData.scholasticMarks.practicalMaxMarks) {
      this.practicalSubjects = examFilteredData.scholasticMarks.practicalMaxMarks.map((item: any) => {
        const practicalSubject = Object.keys(item)[0];
        return practicalSubject;
      })
      if (this.practicalSubjects) {
        this.practicalMaxMarks = examFilteredData.scholasticMarks.practicalMaxMarks;
        this.patchPractical();
      }
    }
    if (examFilteredData.scholasticMarks.periodicTestMaxMarks) {
      this.periodicTestSubjects = examFilteredData.scholasticMarks.periodicTestMaxMarks.map((item: any) => {
        const periodicTestSubject = Object.keys(item)[0];
        return periodicTestSubject;
      })
      if (this.periodicTestSubjects) {
        this.periodicTestMaxMarks = examFilteredData.scholasticMarks.periodicTestMaxMarks;
        this.patchPeriodicTest();
      }
    }

    if (examFilteredData.scholasticMarks.noteBookMaxMarks) {
      this.noteBookSubjects = examFilteredData.scholasticMarks.noteBookMaxMarks.map((item: any) => {
        const noteBookSubject = Object.keys(item)[0];
        return noteBookSubject;
      })
      if (this.noteBookSubjects) {
        this.noteBookMaxMarks = examFilteredData.scholasticMarks.noteBookMaxMarks;
        this.patchNoteBook();
      }
    }
    if (examFilteredData.scholasticMarks.subjectEnrichmentMaxMarks) {
      this.subjectEnrichmentSubjects = examFilteredData.scholasticMarks.subjectEnrichmentMaxMarks.map((item: any) => {
        const subjectEnrichmentSubject = Object.keys(item)[0];
        return subjectEnrichmentSubject;
      })
      if (this.subjectEnrichmentSubjects) {
        this.subjectEnrichmentMaxMarks = examFilteredData.scholasticMarks.subjectEnrichmentMaxMarks;
        this.patchSubjectEnrichment();
      }
    }
    if (examFilteredData.scholasticMarks.projectMaxMarks) {
      this.projectSubjects = examFilteredData.scholasticMarks.projectMaxMarks.map((item: any) => {
        const projectSubject = Object.keys(item)[0];
        return projectSubject;
      })
      if (this.projectSubjects) {
        this.projectMaxMarks = examFilteredData.scholasticMarks.projectMaxMarks;
        this.patchProject();
      }
    }
    if (examFilteredData.scholasticMarks.halfYearlyMaxMarks) {
      this.halfYearlySubjects = examFilteredData.scholasticMarks.halfYearlyMaxMarks.map((item: any) => {
        const halfYearlySubject = Object.keys(item)[0];
        return halfYearlySubject;
      })
      if (this.halfYearlySubjects) {
        this.halfYearlyMaxMarks = examFilteredData.scholasticMarks.halfYearlyMaxMarks;
        this.patchHalfYearly();
      }
    }
    if (examFilteredData.coScholastic) {
      this.coScholastic = examFilteredData.coScholastic;
      if (this.coScholastic) {
        this.patchCoScholastic();
      }
    }

    this.resultStructureInfo = {
      practicalMaxMarks: examFilteredData.scholasticMarks.practicalMaxMarks || [],
      noteBookMaxMarks: examFilteredData.scholasticMarks.noteBookMaxMarks || [],
      periodicTestMaxMarks: examFilteredData.scholasticMarks.periodicTestMaxMarks || [],
      subjectEnrichmentMaxMarks: examFilteredData.scholasticMarks.subjectEnrichmentMaxMarks || [],
      projectMaxMarks: examFilteredData.scholasticMarks.projectMaxMarks || [],
      halfYearlyMaxMarks: examFilteredData.scholasticMarks.halfYearlyMaxMarks || [],
      theoryMaxMarks: examFilteredData.scholasticMarks.theoryMaxMarks || [],
      theoryPassMarks: examFilteredData.scholasticMarks.theoryPassMarks || [],
      gradeMaxMarks: examFilteredData.gradeMaxMarks,
      gradeMinMarks: examFilteredData.gradeMinMarks,
      supplySubjectLimit:examFilteredData.supplySubjectLimit,
    };
  }

  getSingleClassResultStrucByStream(params: any) {
    this.examResultStructureService.getSingleClassResultStrucByStream(params).subscribe((res: any) => {
      if (res) {
        this.marksheetTemplateStructureInfo = res;
        this.examType = Object.keys(res.marksheetTemplateStructure.examStructure);
      }
    }, err => {
      this.falseAllValue();
    })
  }

  patchTheory() {
    this.patchSubjectMarks(this.theorySubjects, 'type.theoryMarks', this.theoryMaxMarks);
  }
  
  patchPractical() {
    this.patchSubjectMarks(this.practicalSubjects, 'type.practicalMarks', this.practicalMaxMarks);
  }
  
  patchPeriodicTest() {
    this.patchSubjectMarks(this.periodicTestSubjects, 'type.periodicTestMarks', this.periodicTestMaxMarks);
  }
  
  patchNoteBook() {
    this.patchSubjectMarks(this.noteBookSubjects, 'type.noteBookMarks', this.noteBookMaxMarks);
  }
  
  patchSubjectEnrichment() {
    this.patchSubjectMarks(this.subjectEnrichmentSubjects, 'type.subjectEnrichmentMarks', this.subjectEnrichmentMaxMarks);
  }
  
  patchProject() {
    this.patchSubjectMarks(this.projectSubjects, 'type.projectMarks', this.projectMaxMarks);
  }
  
  patchHalfYearly() {
    this.patchSubjectMarks(this.halfYearlySubjects, 'type.halfYearlyMarks', this.halfYearlyMaxMarks);
  }
  patchCoScholastic() {
    const controlOne = <FormArray>this.examResultForm.get('type.coScholastic');
    this.coScholastic.forEach((x: any) => {
      controlOne.push(this.patchCoScholasticValues(x))
    })
  }
  patchCoScholasticValues(coScholastic: any) {
    return this.fb.group({
      [coScholastic]: ['', [Validators.required]],
    })
  }
  
  createMarksGroup(subject: string, maxMarksList: any[], requireMax: boolean = true): FormGroup {
    const maxMarks = this.getMaxMarksFromList(subject, maxMarksList);
    const validators = [Validators.required, Validators.pattern('^[0-9]+$')];
  
    if (requireMax) {
      validators.push(Validators.max(maxMarks));
    }
  
    return this.fb.group({
      [subject]: ['', validators]
    });
  }
  getMaxMarksFromList(subject: string, maxMarksList: any[]): number {
    const found = maxMarksList.find((obj: any) => obj.hasOwnProperty(subject));
    return found ? found[subject] : 100;
  }
  
  patchSubjectMarks(subjects: string[], formArrayPath: string, maxMarksList: any[], requireMax: boolean = true) {
    const control = this.examResultForm.get(formArrayPath) as FormArray;
    subjects.forEach(subject => {
      control.push(this.createMarksGroup(subject, maxMarksList, requireMax));
    });
  }
  getControlBySubject(index: number, subject: string, formArrayPath: string): AbstractControl | null {
    const control = this.examResultForm.get(formArrayPath) as FormArray;
    const group = control.at(index) as FormGroup;
    return group.get(subject);
  }
  hasError(index: number, subject: string, formArrayPath: string, errorCode: string): boolean {
    const control = this.getControlBySubject(index, subject, formArrayPath);
    return !!(control?.hasError(errorCode) && (control.touched || control.dirty));
  }  
  getSingleFieldError(index: number, subject: string, formArrayPath: string, maxMarksList: any[]): string | null {
    const control = this.getControlBySubject(index, subject, formArrayPath);
    if (!control || !(control.touched || control.dirty)) return null;
  
    if (control.hasError('required')) {
      return `${this.toTitleCase(subject)} marks is required`;
    }
    if (control.hasError('max')) {
      const max = this.getMaxMarksFromList(subject, maxMarksList);
      return `Maximum ${max} marks allowed`;
    }
    if (control.hasError('pattern')) {
      return `Only numbers allowed`;
    }
  
    return null;
  }
  
  toTitleCase(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  // Helper method to mark all form fields as touched for validation display
  private markFormGroupTouched() {
    Object.keys(this.examResultForm.controls).forEach(key => {
      const control = this.examResultForm.get(key);
      control?.markAsTouched();
    });
  }

  examResultAddUpdate() {
    // Check if form is valid first
    if (!this.examResultForm.valid) {
      this.markFormGroupTouched();
      this.errorCheck = true;
      this.errorMsg = 'Please fill all required fields correctly.';
      return;
    }

    // Check if already submitting
    if (this.isClick) {
      return;
    }

    // Reset error state and set loading state
    this.errorCheck = false;
    this.errorMsg = '';
    this.isClick = true;

    const examResult = this.examResultForm.value.type;
    const countSubjectsBelowPassingMarks = (passMarks: any[], actualMarks: any[]): number => {
      return passMarks.reduce((count, passMarkSubject, index) => {
        const subject = Object.keys(passMarkSubject)[0];
        const passMark = parseInt(passMarkSubject[subject], 10);
        const actualMark = actualMarks[index] ? parseInt(actualMarks[index][subject], 10) : 0;
        return actualMark < passMark ? count + 1 : count;
      }, 0);
    };
    const count = countSubjectsBelowPassingMarks(this.resultStructureInfo.theoryPassMarks, examResult.theoryMarks);
    const resultStatus = this.resultStructureInfo.supplySubjectLimit === 0 ? 'PASS' : 
    (count === 0 ? 'PASS' : count <= this.resultStructureInfo.supplySubjectLimit ? 'SUPPLY' : 'FAIL');

    const calculateMaxMarks = (marksArray: any[]): number => {
      return marksArray.reduce((total, subjectMarks) => {
        const subjectName = Object.keys(subjectMarks)[0];
        return total + parseFloat(subjectMarks[subjectName]);
      }, 0);
    };
    const totalTheoryMaxMarks = calculateMaxMarks(this.resultStructureInfo.theoryMaxMarks);
    const totalPracticalMaxMarks = this.resultStructureInfo.practicalMaxMarks ? calculateMaxMarks(this.resultStructureInfo.practicalMaxMarks) : 0;
    const totalPeriodicTestMaxMarks = this.resultStructureInfo.periodicTestMaxMarks ? calculateMaxMarks(this.resultStructureInfo.periodicTestMaxMarks) : 0;
    const totalNoteBookMaxMarks = this.resultStructureInfo.noteBookMaxMarks ? calculateMaxMarks(this.resultStructureInfo.noteBookMaxMarks) : 0;
    const totalSubjectEnrichmentMaxMarks = this.resultStructureInfo.subjectEnrichmentMaxMarks ? calculateMaxMarks(this.resultStructureInfo.subjectEnrichmentMaxMarks) : 0;
    const totalProjectMaxMarks = this.resultStructureInfo.projectMaxMarks ? calculateMaxMarks(this.resultStructureInfo.projectMaxMarks) : 0;
    const totalHalfYearlyMaxMarks = this.resultStructureInfo.halfYearlyMaxMarks ? calculateMaxMarks(this.resultStructureInfo.halfYearlyMaxMarks) : 0;

    const totalMaxMarks = totalTheoryMaxMarks + totalPracticalMaxMarks + totalPeriodicTestMaxMarks + totalNoteBookMaxMarks + totalSubjectEnrichmentMaxMarks + totalProjectMaxMarks + totalHalfYearlyMaxMarks;
    const calculateGrades = (subjectMarks: any[], isPractical: boolean, isPeriodicTest: boolean, isNoteBook: boolean, isSubjectEnrichment: boolean, isProject: boolean, isHalfYearly: boolean) => {
      return subjectMarks.map((subjectMark) => {
        const subjectName = Object.keys(subjectMark)[0];

        const theoryMarks = parseFloat(subjectMark[subjectName]);
        const practicalMarkObject = isPractical ? examResult.practicalMarks.find((practicalMark: any) => practicalMark && practicalMark.hasOwnProperty(subjectName)) : null;
        const practicalMarks = practicalMarkObject ? parseFloat(practicalMarkObject[subjectName]) : 0;

        const periodicTestMarkObject = isPeriodicTest ? examResult.periodicTestMarks.find((periodicTestMark: any) => periodicTestMark && periodicTestMark.hasOwnProperty(subjectName)) : null;
        const periodicTestMarks = periodicTestMarkObject ? parseFloat(periodicTestMarkObject[subjectName]) : 0;
        const noteBookMarkObject = isNoteBook ? examResult.noteBookMarks.find((noteBookMark: any) => noteBookMark && noteBookMark.hasOwnProperty(subjectName)) : null;
        const noteBookMarks = noteBookMarkObject ? parseFloat(noteBookMarkObject[subjectName]) : 0;
        const subjectEnrichmentMarkObject = isSubjectEnrichment ? examResult.subjectEnrichmentMarks.find((subjectEnrichmentMark: any) => subjectEnrichmentMark && subjectEnrichmentMark.hasOwnProperty(subjectName)) : null;
        const subjectEnrichmentMarks = subjectEnrichmentMarkObject ? parseFloat(subjectEnrichmentMarkObject[subjectName]) : 0;
        const projectMarkObject = isProject ? examResult.projectMarks.find((projectMark: any) => projectMark && projectMark.hasOwnProperty(subjectName)) : null;
        const projectMarks = projectMarkObject ? parseFloat(projectMarkObject[subjectName]) : 0;
        const halfYearlyMarkObject = isHalfYearly ? examResult.halfYearlyMarks.find((halfYearlyMark: any) => halfYearlyMark && halfYearlyMark.hasOwnProperty(subjectName)) : null;
        const halfYearlyMarks = halfYearlyMarkObject ? parseFloat(halfYearlyMarkObject[subjectName]) : 0;

        const totalMarks = theoryMarks + practicalMarks + periodicTestMarks + noteBookMarks + subjectEnrichmentMarks + projectMarks + halfYearlyMarks;

        const theoryMaxMarksObject = this.resultStructureInfo.theoryMaxMarks.find((theoryMaxMarks: any) => theoryMaxMarks && theoryMaxMarks.hasOwnProperty(subjectName));
        const theoryMaxMarks = theoryMaxMarksObject ? parseFloat(theoryMaxMarksObject[subjectName]) : 0;

        const practicalMaxMarksObject = isPractical && this.resultStructureInfo.practicalMaxMarks ? this.resultStructureInfo.practicalMaxMarks.find((practicalMaxMark: any) => practicalMaxMark && practicalMaxMark.hasOwnProperty(subjectName)) : null;
        const practicalMaxMarks = practicalMaxMarksObject ? parseFloat(practicalMaxMarksObject[subjectName]) : 0;

        const periodicTestMaxMarksObject = isPeriodicTest && this.resultStructureInfo.periodicTestMaxMarks ? this.resultStructureInfo.periodicTestMaxMarks.find((periodicTestMaxMark: any) => periodicTestMaxMark && periodicTestMaxMark.hasOwnProperty(subjectName)) : null;
        const periodicTestMaxMarks = periodicTestMaxMarksObject ? parseFloat(periodicTestMaxMarksObject[subjectName]) : 0;
        const noteBookMaxMarksObject = isNoteBook && this.resultStructureInfo.noteBookMaxMarks ? this.resultStructureInfo.noteBookMaxMarks.find((noteBookMaxMark: any) => noteBookMaxMark && noteBookMaxMark.hasOwnProperty(subjectName)) : null;
        const noteBookMaxMarks = noteBookMaxMarksObject ? parseFloat(noteBookMaxMarksObject[subjectName]) : 0;
        const subjectEnrichmentMaxMarksObject = isSubjectEnrichment && this.resultStructureInfo.subjectEnrichmentMaxMarks ? this.resultStructureInfo.subjectEnrichmentMaxMarks.find((subjectEnrichmentMaxMark: any) => subjectEnrichmentMaxMark && subjectEnrichmentMaxMark.hasOwnProperty(subjectName)) : null;
        const subjectEnrichmentMaxMarks = subjectEnrichmentMaxMarksObject ? parseFloat(subjectEnrichmentMaxMarksObject[subjectName]) : 0;
        const projectMaxMarksObject = isProject && this.resultStructureInfo.projectMaxMarks ? this.resultStructureInfo.projectMaxMarks.find((projectMaxMark: any) => projectMaxMark && projectMaxMark.hasOwnProperty(subjectName)) : null;
        const projectMaxMarks = projectMaxMarksObject ? parseFloat(projectMaxMarksObject[subjectName]) : 0;
        const halfYearlyMaxMarksObject = isHalfYearly && this.resultStructureInfo.halfYearlyMaxMarks ? this.resultStructureInfo.halfYearlyMaxMarks.find((halfYearlyMaxMark: any) => halfYearlyMaxMark && halfYearlyMaxMark.hasOwnProperty(subjectName)) : null;
        const halfYearlyMaxMarks = halfYearlyMaxMarksObject ? parseFloat(halfYearlyMaxMarksObject[subjectName]) : 0;

        const totalMaxMarks = theoryMaxMarks + practicalMaxMarks + periodicTestMaxMarks + noteBookMaxMarks + subjectEnrichmentMaxMarks + projectMaxMarks + halfYearlyMaxMarks;
        const totalGettingMarksPercentile = ((totalMarks / totalMaxMarks) * 100).toFixed(0);
        const gradeMaxMarks = this.resultStructureInfo.gradeMaxMarks;
        const gradeMinMarks = this.resultStructureInfo.gradeMinMarks;
        const grade = gradeMaxMarks.reduce((grade: string, gradeRange: any, i: number) => {
          const maxMarks = parseFloat(String(Object.values(gradeRange)[0]));
          const minMarks = parseFloat(String(Object.values(gradeMinMarks[i])[0]));
          return parseFloat(totalGettingMarksPercentile) >= minMarks && parseFloat(totalGettingMarksPercentile) <= maxMarks ? Object.keys(gradeRange)[0] : grade;
        }, '');
        return {
          subject: subjectName,
          theoryMarks: theoryMarks,
          practicalMarks: practicalMarks,
          periodicTestMarks: periodicTestMarks,
          noteBookMarks: noteBookMarks,
          subjectEnrichmentMarks: subjectEnrichmentMarks,
          projectMarks: projectMarks,
          halfYearlyMarks: halfYearlyMarks,
          totalMarks: totalMarks,
          grade: grade,
        };
      });
    };
    let marks = calculateGrades(examResult.theoryMarks, !!examResult.practicalMarks, !!examResult.periodicTestMarks, !!examResult.noteBookMarks, !!examResult.subjectEnrichmentMarks, !!examResult.projectMarks, !!examResult.halfYearlyMarks);
    const grandTotalMarks = marks.reduce((total: number, item: any) => total + item.totalMarks, 0);
    const percentile = parseFloat(((grandTotalMarks / totalMaxMarks) * 100).toFixed(2));
    const basePercentile = parseFloat(percentile.toFixed(0));
    const percentileGrade = this.resultStructureInfo.gradeMaxMarks.reduce((grade: string, gradeRange: any, i: number) => {
      const maxMarks = parseFloat(String(Object.values(gradeRange)[0]));
      const minMarks = parseFloat(String(Object.values(this.resultStructureInfo.gradeMinMarks[i])[0]));
      return basePercentile >= minMarks && basePercentile <= maxMarks ? Object.keys(gradeRange)[0] : grade;
    }, '');

    let emptyArrayProperties: any[] = [];
    for (let key in this.resultStructureInfo) {
      if (Array.isArray(this.resultStructureInfo[key]) && this.resultStructureInfo[key].length === 0) {
        let transformedKey = key.replace(/Max|Pass/, '');
        emptyArrayProperties.push(transformedKey);
      }
    }

    marks.forEach((subject: any) => {
      emptyArrayProperties.forEach(prop => {
        delete subject[prop];
      });
    });

    const coScholastic = examResult.coScholastic.map((activity: any) => {
      const activityName = Object.keys(activity)[0];
      const grade = activity[activityName];
      return {
        activity: activityName,
        grade: grade
      };
    });

    let examResultInfo = {
      marks: marks,
      grandTotalMarks: grandTotalMarks,
      totalMaxMarks: totalMaxMarks,
      percentile: percentile,
      percentileGrade: percentileGrade,
      resultStatus: resultStatus,
      coScholastic: coScholastic,
    };

    this.examResultForm.value.resultDetail = examResultInfo;
    this.examResultForm.value.adminId = this.adminId;
    this.examResultForm.value.rollNumber = this.selectedRollNumber;
    
    if (this.updateMode) {
      this.examResultService.updateExamResult(this.examResultForm.value).subscribe(
        (res: any) => {
          if (res) {
            this.isClick = false;
            this.successDone(res);
          }
        },
        (err) => {
          this.errorCheck = true;
          this.errorMsg = err.error || 'An error occurred while updating result.';
          this.isClick = false;
        }
      );
    } else {
      if (this.practicalSubjects.length === 0) {
        delete this.examResultForm.value.type.practicalMarks;
      }
      this.examResultForm.value.createdBy = "Admin";
      this.examResultForm.value.stream = this.stream;
      this.examResultForm.value.class = this.cls;
      
      this.examResultService.addExamResult(this.examResultForm.value).subscribe(
        (res: any) => {
          if (res) {
            this.isClick = false;
            this.successDone(res);
          }
        },
        (err) => {
          this.errorCheck = true;
          this.errorMsg = err.error || 'An error occurred while adding result.';
          this.isClick = false;
        }
      );
    }
  }
}
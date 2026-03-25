import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { TeacherStudentMarksheetResultAddRoutingModule } from './teacher-student-marksheet-result-add-routing.module';
import { TeacherStudentMarksheetResultAddComponent } from './teacher-student-marksheet-result-add.component';
import { TeacherSharedModule } from '../teacher-shared/teacher-shared.module';


@NgModule({
  declarations: [
    TeacherStudentMarksheetResultAddComponent
  ],
  imports: [
    CommonModule,
    TeacherStudentMarksheetResultAddRoutingModule,
    TeacherSharedModule
  ]
})
export class TeacherStudentMarksheetResultAddModule { }

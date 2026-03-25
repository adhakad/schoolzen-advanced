import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { TeacherStudentMarksheetRoutingModule } from './teacher-student-marksheet-routing.module';
import { TeacherStudentMarksheetComponent } from './teacher-student-marksheet.component';
import { TeacherSharedModule } from '../teacher-shared/teacher-shared.module';


@NgModule({
  declarations: [
    TeacherStudentMarksheetComponent
  ],
  imports: [
    CommonModule,
    TeacherStudentMarksheetRoutingModule,
    TeacherSharedModule
  ]
})
export class TeacherStudentMarksheetModule { }
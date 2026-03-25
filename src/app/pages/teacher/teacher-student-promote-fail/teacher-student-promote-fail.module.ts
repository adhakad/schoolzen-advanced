import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { TeacherStudentPromoteFailRoutingModule } from './teacher-student-promote-fail-routing.module';
import { TeacherStudentPromoteFailComponent } from './teacher-student-promote-fail.component';
import { TeacherSharedModule } from '../teacher-shared/teacher-shared.module';


@NgModule({
  declarations: [
    TeacherStudentPromoteFailComponent
  ],
  imports: [
    CommonModule,
    TeacherStudentPromoteFailRoutingModule,
    TeacherSharedModule
  ]
})
export class TeacherStudentPromoteFailModule { }

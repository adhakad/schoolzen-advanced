import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { TeacherStudentRoutingModule } from './teacher-student-routing.module';
import { TeacherStudentComponent } from './teacher-student.component';
import { TeacherSharedModule } from '../teacher-shared/teacher-shared.module';


@NgModule({
  declarations: [
    TeacherStudentComponent
  ],
  imports: [
    CommonModule,
    TeacherStudentRoutingModule,
    TeacherSharedModule
  ]
})
export class TeacherStudentModule { }

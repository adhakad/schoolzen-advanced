import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { TeacherStudentFeesStatementRoutingModule } from './teacher-student-fees-statement-routing.module';
import { TeacherStudentFeesStatementComponent } from './teacher-student-fees-statement.component';
import { TeacherSharedModule } from '../teacher-shared/teacher-shared.module';


@NgModule({
  declarations: [
    TeacherStudentFeesStatementComponent
  ],
  imports: [
    CommonModule,
    TeacherStudentFeesStatementRoutingModule,
    TeacherSharedModule
  ]
})
export class TeacherStudentFeesStatementModule { }

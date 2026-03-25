import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { TeacherStudentMarksheetStructureRoutingModule } from './teacher-student-marksheet-structure-routing.module';
import { TeacherStudentMarksheetStructureComponent } from './teacher-student-marksheet-structure.component';
import { TeacherSharedModule } from '../teacher-shared/teacher-shared.module';


@NgModule({
  declarations: [
    TeacherStudentMarksheetStructureComponent
  ],
  imports: [
    CommonModule,
    TeacherStudentMarksheetStructureRoutingModule,
    TeacherSharedModule
  ]
})
export class TeacherStudentMarksheetStructureModule { }

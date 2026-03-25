import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { TeacherStudentMarksheetStructureEditRoutingModule } from './teacher-student-marksheet-structure-edit-routing.module';
import { TeacherStudentMarksheetStructureEditComponent } from './teacher-student-marksheet-structure-edit.component';
import { TeacherSharedModule } from '../teacher-shared/teacher-shared.module';


@NgModule({
  declarations: [
    TeacherStudentMarksheetStructureEditComponent
  ],
  imports: [
    CommonModule,
    TeacherStudentMarksheetStructureEditRoutingModule,
    TeacherSharedModule
  ]
})
export class TeacherStudentMarksheetStructureEditModule { }

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { AdminStudentMarksheetStructureEditRoutingModule } from './admin-student-marksheet-structure-edit-routing.module';
import { AdminStudentMarksheetStructureEditComponent } from './admin-student-marksheet-structure-edit.component';
import { AdminSharedModule } from '../admin-shared/admin-shared.module';


@NgModule({
  declarations: [
    AdminStudentMarksheetStructureEditComponent
  ],
  imports: [
    CommonModule,
    AdminStudentMarksheetStructureEditRoutingModule,
    AdminSharedModule
  ]
})
export class AdminStudentMarksheetStructureEditModule { }

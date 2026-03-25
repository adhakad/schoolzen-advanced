import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { AdminStudentMarksheetStructureRoutingModule } from './admin-student-marksheet-structure-routing.module';
import { AdminStudentMarksheetStructureComponent } from './admin-student-marksheet-structure.component';
import { AdminSharedModule } from '../admin-shared/admin-shared.module';


@NgModule({
  declarations: [
    AdminStudentMarksheetStructureComponent
  ],
  imports: [
    CommonModule,
    AdminStudentMarksheetStructureRoutingModule,
    AdminSharedModule
  ]
})
export class AdminStudentMarksheetStructureModule { }

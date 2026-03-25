import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { AdminStudentMarksheetRoutingModule } from './admin-student-marksheet-routing.module';
import { AdminStudentMarksheetComponent } from './admin-student-marksheet.component';
import { AdminSharedModule } from '../admin-shared/admin-shared.module';


@NgModule({
  declarations: [
    AdminStudentMarksheetComponent
  ],
  imports: [
    CommonModule,
    AdminStudentMarksheetRoutingModule,
    AdminSharedModule
  ]
})
export class AdminStudentMarksheetModule { }
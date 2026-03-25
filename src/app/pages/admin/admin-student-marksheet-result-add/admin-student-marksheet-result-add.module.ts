import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { AdminStudentMarksheetResultAddRoutingModule } from './admin-student-marksheet-result-add-routing.module';
import { AdminStudentMarksheetResultAddComponent } from './admin-student-marksheet-result-add.component';
import { AdminSharedModule } from '../admin-shared/admin-shared.module';


@NgModule({
  declarations: [
    AdminStudentMarksheetResultAddComponent
  ],
  imports: [
    CommonModule,
    AdminStudentMarksheetResultAddRoutingModule,
    AdminSharedModule
  ]
})
export class AdminStudentMarksheetResultAddModule { }

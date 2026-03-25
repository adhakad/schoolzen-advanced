import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { AdminStudentFeesStructureRoutingModule } from './admin-student-fees-structure-routing.module';
import { AdminStudentFeesStructureComponent } from './admin-student-fees-structure.component';
import { AdminSharedModule } from '../admin-shared/admin-shared.module';


@NgModule({
  declarations: [
    AdminStudentFeesStructureComponent
  ],
  imports: [
    CommonModule,
    AdminStudentFeesStructureRoutingModule,
    AdminSharedModule
  ]
})
export class AdminStudentFeesStructureModule { }
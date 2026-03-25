import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { AdminStudentFeesStatementRoutingModule } from './admin-student-fees-statement-routing.module';
import { AdminStudentFeesStatementComponent } from './admin-student-fees-statement.component';
import { AdminSharedModule } from '../admin-shared/admin-shared.module';

@NgModule({
  declarations: [
    AdminStudentFeesStatementComponent,
  ],
  imports: [
    CommonModule,
    AdminStudentFeesStatementRoutingModule,
    AdminSharedModule
  ]
})
export class AdminStudentFeesStatementModule { }

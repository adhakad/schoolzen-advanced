import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PayrollRoutingModule } from './payroll-routing.module';
import { AdminSharedModule } from '../admin-shared/admin-shared.module';
import { PayrollComponent } from './payroll.component';


@NgModule({
  declarations: [
    PayrollComponent
  ],
  imports: [
    CommonModule,
    PayrollRoutingModule,

    AdminSharedModule,
  ]
})
export class PayrollModule { }

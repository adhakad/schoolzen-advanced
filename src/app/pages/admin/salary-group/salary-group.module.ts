import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { SalaryGroupRoutingModule } from './salary-group-routing.module';
import { AdminSharedModule } from '../admin-shared/admin-shared.module';
import { SalaryGroupComponent } from './salary-group.component';


@NgModule({
  declarations: [
    SalaryGroupComponent
  ],
  imports: [
    CommonModule,
    SalaryGroupRoutingModule,

    AdminSharedModule,
  ]
})
export class SalaryGroupModule { }

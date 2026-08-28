import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { SalaryStructureRoutingModule } from './salary-structure-routing.module';
import { AdminSharedModule } from '../admin-shared/admin-shared.module';
import { SalaryStructureComponent } from './salary-structure.component';


@NgModule({
  declarations: [
    SalaryStructureComponent
  ],
  imports: [
    CommonModule,
    SalaryStructureRoutingModule,

    AdminSharedModule,
  ]
})
export class SalaryStructureModule { }

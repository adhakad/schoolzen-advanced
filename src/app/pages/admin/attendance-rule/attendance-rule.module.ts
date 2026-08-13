import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { AttendanceRuleRoutingModule } from './attendance-rule-routing.module';
import { AdminSharedModule } from '../admin-shared/admin-shared.module';
import { AttendanceRuleComponent } from './attendance-rule.component';


@NgModule({
  declarations: [
    AttendanceRuleComponent
  ],
  imports: [
    CommonModule,
    AttendanceRuleRoutingModule,

    AdminSharedModule,
  ]
})
export class AttendanceRuleModule { }

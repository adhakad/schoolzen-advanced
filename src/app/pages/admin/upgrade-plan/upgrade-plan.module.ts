import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { UpgradePlanRoutingModule } from './upgrade-plan-routing.module';
import { UpgradePlanComponent } from './upgrade-plan.component';
import { AdminSharedModule } from '../admin-shared/admin-shared.module';


@NgModule({
  declarations: [
    UpgradePlanComponent
  ],
  imports: [
    CommonModule,
    UpgradePlanRoutingModule,
    AdminSharedModule
  ]
})
export class UpgradePlanModule { }

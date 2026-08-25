import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { LeaveLimitRoutingModule } from './leave-limit-routing.module';
import { AdminSharedModule } from '../admin-shared/admin-shared.module';
import { LeaveLimitComponent } from './leave-limit.component';


@NgModule({
  declarations: [
    LeaveLimitComponent
  ],
  imports: [
    CommonModule,
    LeaveLimitRoutingModule,

    AdminSharedModule,
  ]
})
export class LeaveLimitModule { }

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PromoteFailRoutingModule } from './promote-fail-routing.module';
import { PromoteFailComponent } from './promote-fail.component';
import { AdminSharedModule } from '../admin-shared/admin-shared.module';


@NgModule({
  declarations: [
    PromoteFailComponent
  ],
  imports: [
    CommonModule,
    PromoteFailRoutingModule,AdminSharedModule
  ]
})
export class PromoteFailModule { }

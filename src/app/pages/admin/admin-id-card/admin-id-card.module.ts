import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { AdminIdCardRoutingModule } from './admin-id-card-routing.module';
import { AdminIdCardComponent } from './admin-id-card.component';
import { AdminSharedModule } from '../admin-shared/admin-shared.module';


@NgModule({
  declarations: [
    AdminIdCardComponent
  ],
  imports: [
    CommonModule,
    AdminIdCardRoutingModule,
    AdminSharedModule
  ]
})
export class AdminIdCardModule { }

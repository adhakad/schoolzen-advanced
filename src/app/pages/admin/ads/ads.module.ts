import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { AdsRoutingModule } from './ads-routing.module';
import { AdminSharedModule } from '../admin-shared/admin-shared.module';
import { AdsComponent } from './ads.component';


@NgModule({
  declarations: [
    AdsComponent
  ],
  imports: [
    CommonModule,
    AdsRoutingModule,

    AdminSharedModule,
  ]
})
export class AdsModule { }

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { BannerRoutingModule } from './banner-routing.module';
import { AdminSharedModule } from '../admin-shared/admin-shared.module';
import { BannerComponent } from './banner.component';


@NgModule({
  declarations: [
    BannerComponent
  ],
  imports: [
    CommonModule,
    BannerRoutingModule,

    AdminSharedModule,
  ]
})
export class BannerModule { }

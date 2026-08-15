import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { SalesDeviceRoutingModule } from './sales-device-routing.module';
import { SalesDeviceComponent } from './sales-device.component';
import { SalesSharedModule } from '../sales-shared/sales-shared.module';


@NgModule({
  declarations: [
    SalesDeviceComponent
  ],
  imports: [
    CommonModule,
    SalesDeviceRoutingModule,

    SalesSharedModule,
  ]
})
export class SalesDeviceModule { }

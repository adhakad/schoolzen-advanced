import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { AdmissionRoutingModule } from './admission-routing.module';
import { AdmissionComponent } from './admission.component';
import { AdminSharedModule } from '../admin-shared/admin-shared.module';


@NgModule({
  declarations: [
    AdmissionComponent
  ],
  imports: [
    CommonModule,
    AdmissionRoutingModule,
    AdminSharedModule
  ]
})
export class AdmissionModule { }

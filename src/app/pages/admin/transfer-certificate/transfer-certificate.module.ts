import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { TransferCertificateRoutingModule } from './transfer-certificate-routing.module';
import { TransferCertificateComponent } from './transfer-certificate.component';
import { AdminSharedModule } from '../admin-shared/admin-shared.module';


@NgModule({
  declarations: [
    TransferCertificateComponent
  ],
  imports: [
    CommonModule,
    TransferCertificateRoutingModule,
    AdminSharedModule
  ]
})
export class TransferCertificateModule { }

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { IssuedTransferCertificateRoutingModule } from './issued-transfer-certificate-routing.module';
import { IssuedTransferCertificateComponent } from './issued-transfer-certificate.component';
import { AdminSharedModule } from '../admin-shared/admin-shared.module';


@NgModule({
  declarations: [
    IssuedTransferCertificateComponent
  ],
  imports: [
    CommonModule,
    IssuedTransferCertificateRoutingModule,
    AdminSharedModule
  ]
})
export class IssuedTransferCertificateModule { }

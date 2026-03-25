import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { IssuedTransferCertificateComponent } from './issued-transfer-certificate.component';

const routes: Routes = [
  { path: '', component: IssuedTransferCertificateComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class IssuedTransferCertificateRoutingModule { }

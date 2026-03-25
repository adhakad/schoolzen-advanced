import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TransferCertificateComponent } from './transfer-certificate.component';

const routes: Routes = [
  { path: '', component: TransferCertificateComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class TransferCertificateRoutingModule { }

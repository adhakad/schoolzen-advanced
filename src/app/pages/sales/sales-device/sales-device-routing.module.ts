import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SalesDeviceComponent } from './sales-device.component';

const routes: Routes = [
  { path: '', component: SalesDeviceComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class SalesDeviceRoutingModule { }

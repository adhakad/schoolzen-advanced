import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AdminForgotComponent } from './admin-forgot.component';

const routes: Routes = [
  { path: '', component: AdminForgotComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AdminForgotRoutingModule { }

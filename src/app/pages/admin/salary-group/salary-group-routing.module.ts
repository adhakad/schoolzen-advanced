import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SalaryGroupComponent } from './salary-group.component';

const routes: Routes = [
  { path: '', component: SalaryGroupComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class SalaryGroupRoutingModule { }

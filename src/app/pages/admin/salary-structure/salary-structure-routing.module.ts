import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SalaryStructureComponent } from './salary-structure.component';

const routes: Routes = [
  { path: '', component: SalaryStructureComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class SalaryStructureRoutingModule { }

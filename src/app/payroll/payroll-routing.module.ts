import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { GeneratePayrollComponent } from './generate-payroll/generate-payroll.component';
import { SalaryPayoutsComponent } from './salary-payouts/salary-payouts.component';
import { SalaryGroupsComponent } from './salary-groups/salary-groups.component';
import { AssignSalaryComponent } from './assign-salary/assign-salary.component';

// Mounted by v2-routing.module.ts at /v2/payroll — matches the sidebar's links.
const routes: Routes = [
  { path: '', redirectTo: 'generate-payroll', pathMatch: 'full' },
  { path: 'generate-payroll', component: GeneratePayrollComponent },
  { path: 'salary-payouts', component: SalaryPayoutsComponent },
  { path: 'salary-groups', component: SalaryGroupsComponent },
  { path: 'assign-salary', component: AssignSalaryComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class PayrollRoutingModule {}

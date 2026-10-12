/**
 * Payroll — Generate Payroll, Salary Payouts, Salary Groups, Assign Salary (module 7).
 *
 * Routing and declarations ONLY. Services and models live in the shared layer folders
 * (shared/services/payroll/, shared/models/payroll/), mirroring the backend's layout.
 */
import { NgModule } from '@angular/core';
import { SharedComponentsModule } from 'src/app/shared/shared-components.module';
import { SharedPipeModule } from 'src/app/pipes/shared-pipe/shared-pipe.module';
import { PayrollRoutingModule } from './payroll-routing.module';
import { SalaryGroupsComponent } from './salary-groups/salary-groups.component';
import { AssignSalaryComponent } from './assign-salary/assign-salary.component';
import { GeneratePayrollComponent } from './generate-payroll/generate-payroll.component';
import { SalaryPayoutsComponent } from './salary-payouts/salary-payouts.component';
import { StaffCascadeFilterComponent } from './staff-cascade-filter/staff-cascade-filter.component';
import { PayslipComponent } from './payslip/payslip.component';

@NgModule({
  declarations: [
    SalaryGroupsComponent,
    AssignSalaryComponent,
    GeneratePayrollComponent,
    SalaryPayoutsComponent,
    StaffCascadeFilterComponent,
    PayslipComponent
  ],
  imports: [SharedComponentsModule, SharedPipeModule, PayrollRoutingModule]
})
export class PayrollModule {}

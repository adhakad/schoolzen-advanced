import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { FeesComponent } from './fees/fees.component';
import { FeeStructureComponent } from './fee-structure/fee-structure.component';
import { FeeStatementComponent } from './fee-statement/fee-statement.component';
import { FeeReminderComponent } from './fee-reminder/fee-reminder.component';

// Mounted by v2-routing.module.ts at /v2/fees — matches the sidebar's links. Fee Statement is
// opened per student from the Fees table (`fee-statement/:studentId`).
const routes: Routes = [
  { path: '', redirectTo: 'fees', pathMatch: 'full' },
  { path: 'fees', component: FeesComponent },
  { path: 'fee-structure', component: FeeStructureComponent },
  { path: 'fee-statement', component: FeeStatementComponent },
  { path: 'fee-statement/:studentId', component: FeeStatementComponent },
  { path: 'fee-reminder', component: FeeReminderComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class FeesRoutingModule {}

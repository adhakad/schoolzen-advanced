import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AttendanceRuleComponent } from './attendance-rule.component';

const routes: Routes = [
  { path: '', component: AttendanceRuleComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AttendanceRuleRoutingModule { }

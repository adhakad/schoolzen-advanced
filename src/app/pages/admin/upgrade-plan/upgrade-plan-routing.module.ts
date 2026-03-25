import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { UpgradePlanComponent } from './upgrade-plan.component';

const routes: Routes = [
  { path: '', component: UpgradePlanComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class UpgradePlanRoutingModule { }

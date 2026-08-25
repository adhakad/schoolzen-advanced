import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LeaveLimitComponent } from './leave-limit.component';

const routes: Routes = [
  { path: '', component: LeaveLimitComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class LeaveLimitRoutingModule { }

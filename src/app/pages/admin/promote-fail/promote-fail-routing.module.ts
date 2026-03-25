import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PromoteFailComponent } from './promote-fail.component';

const routes: Routes = [
  { path: '', component: PromoteFailComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class PromoteFailRoutingModule { }

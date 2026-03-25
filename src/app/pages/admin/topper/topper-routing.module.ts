import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TopperComponent } from './topper.component';

const routes: Routes = [
  { path: '', component: TopperComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class TopperRoutingModule { }

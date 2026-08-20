import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ClassShiftComponent } from './class-shift.component';

const routes: Routes = [
  { path: '', component: ClassShiftComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ClassShiftRoutingModule { }

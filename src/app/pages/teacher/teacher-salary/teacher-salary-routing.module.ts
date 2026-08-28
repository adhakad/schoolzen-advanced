import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TeacherSalaryComponent } from './teacher-salary.component';

const routes: Routes = [
  { path: '', component: TeacherSalaryComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class TeacherSalaryRoutingModule { }

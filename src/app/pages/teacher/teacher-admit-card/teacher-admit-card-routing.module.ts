import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TeacherAdmitCardComponent } from './teacher-admit-card.component';

const routes: Routes = [
  { path: '', component: TeacherAdmitCardComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class TeacherAdmitCardRoutingModule { }

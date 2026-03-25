import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ClassSubjectComponent } from './class-subject.component';

const routes: Routes = [
  { path: '', component: ClassSubjectComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ClassSubjectRoutingModule { }

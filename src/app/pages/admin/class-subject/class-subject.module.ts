import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ClassSubjectRoutingModule } from './class-subject-routing.module';
import { AdminSharedModule } from '../admin-shared/admin-shared.module';
import { ClassSubjectComponent } from './class-subject.component';


@NgModule({
  declarations: [
    ClassSubjectComponent
  ],
  imports: [
    CommonModule,
    ClassSubjectRoutingModule,

    AdminSharedModule,
  ]
})
export class ClassSubjectModule { }

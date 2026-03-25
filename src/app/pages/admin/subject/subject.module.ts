import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { SubjectRoutingModule } from './subject-routing.module';
import { AdminSharedModule } from '../admin-shared/admin-shared.module';
import { SubjectComponent } from './subject.component';


@NgModule({
  declarations: [
    SubjectComponent
  ],
  imports: [
    CommonModule,
    SubjectRoutingModule,

    AdminSharedModule,
  ]
})
export class SubjectModule { }

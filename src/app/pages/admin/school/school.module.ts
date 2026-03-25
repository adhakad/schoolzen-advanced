import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { SchoolRoutingModule } from './school-routing.module';
import { AdminSharedModule } from '../admin-shared/admin-shared.module';
import { SchoolComponent } from './school.component';


@NgModule({
  declarations: [
    SchoolComponent
  ],
  imports: [
    CommonModule,
    SchoolRoutingModule,
    AdminSharedModule
  ]
})
export class SchoolModule { }

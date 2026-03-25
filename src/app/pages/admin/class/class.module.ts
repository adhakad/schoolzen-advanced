import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ClassRoutingModule } from './class-routing.module';
import { AdminSharedModule } from '../admin-shared/admin-shared.module';
import { ClassComponent } from './class.component';


@NgModule({
  declarations: [
    ClassComponent
  ],
  imports: [
    CommonModule,
    ClassRoutingModule,

    AdminSharedModule,
  ]
})
export class ClassModule { }

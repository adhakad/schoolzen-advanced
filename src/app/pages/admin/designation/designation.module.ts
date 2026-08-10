import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { DesignationRoutingModule } from './designation-routing.module';
import { AdminSharedModule } from '../admin-shared/admin-shared.module';
import { DesignationComponent } from './designation.component';


@NgModule({
  declarations: [
    DesignationComponent
  ],
  imports: [
    CommonModule,
    DesignationRoutingModule,

    AdminSharedModule,
  ]
})
export class DesignationModule { }

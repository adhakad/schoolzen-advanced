import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { TopperRoutingModule } from './topper-routing.module';
import { AdminSharedModule } from '../admin-shared/admin-shared.module';
import { TopperComponent } from './topper.component';


@NgModule({
  declarations: [
    TopperComponent
  ],
  imports: [
    CommonModule,
    TopperRoutingModule,

    AdminSharedModule,
  ]
})
export class TopperModule { }

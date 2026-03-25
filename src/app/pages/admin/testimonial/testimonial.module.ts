import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { TestimonialRoutingModule } from './testimonial-routing.module';
import { AdminSharedModule } from '../admin-shared/admin-shared.module';
import { TestimonialComponent } from './testimonial.component';


@NgModule({
  declarations: [
    TestimonialComponent
  ],
  imports: [
    CommonModule,
    TestimonialRoutingModule,

    AdminSharedModule,
  ]
})
export class TestimonialModule { }

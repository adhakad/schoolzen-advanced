/**
 * Holiday — Holidays, Templates, Assign (module 6).
 *
 * Routing and declarations ONLY. Services and models live in the shared layer folders
 * (shared/services/holiday/, shared/models/holiday/), mirroring the backend's layout.
 */
import { NgModule } from '@angular/core';
import { SharedComponentsModule } from 'src/app/shared/shared-components.module';
import { HolidayRoutingModule } from './holiday-routing.module';
import { HolidaysComponent } from './holidays/holidays.component';
import { HolidayTemplatesComponent } from './templates/templates.component';
import { HolidayAssignComponent } from './assign/assign.component';
import { HolidayCalendarFilterComponent } from './holiday-calendar-filter/holiday-calendar-filter.component';

@NgModule({
  declarations: [HolidaysComponent, HolidayTemplatesComponent, HolidayAssignComponent, HolidayCalendarFilterComponent],
  imports: [SharedComponentsModule, HolidayRoutingModule]
})
export class HolidayModule {}

/**
 * ManageShifts page — its own lazy chunk (global-fixes.md rule 3: lazy loading per page route, not
 * per module), so opening one Attendance page never downloads the other two.
 */
import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedComponentsModule } from 'src/app/shared/shared-components.module';
import { ManageShiftsComponent } from './manage-shifts.component';

@NgModule({
  declarations: [ManageShiftsComponent],
  imports: [SharedComponentsModule, RouterModule.forChild([{ path: '', component: ManageShiftsComponent }])]
})
export class ManageShiftsModule {}

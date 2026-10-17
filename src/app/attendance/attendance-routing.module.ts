import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

// Mounted by v2-routing.module.ts at /v2/attendance — matches the sidebar's links.
// Each page is its own lazy chunk (global-fixes.md rule 3): routes load per page, never the
// whole module at once.
const routes: Routes = [
  { path: '', redirectTo: 'overview', pathMatch: 'full' },
  {
    path: 'overview',
    loadChildren: () => import('./attendance-overview/attendance-overview.module').then((m) => m.AttendanceOverviewModule)
  },
  {
    path: 'shifts',
    loadChildren: () => import('./manage-shifts/manage-shifts.module').then((m) => m.ManageShiftsModule)
  },
  {
    path: 'roster',
    loadChildren: () => import('./roster/roster.module').then((m) => m.RosterModule)
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AttendanceRoutingModule {}

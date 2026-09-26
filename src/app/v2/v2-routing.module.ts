import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { V2ShellComponent } from './v2-shell/v2-shell.component';
import { ComponentsGalleryComponent } from './components-gallery/components-gallery.component';
import { NotBuiltComponent } from './not-built/not-built.component';

// Every /v2 page is a CHILD of the shell route. A module's page prompt adds one entry to
// this children array (lazy-loaded, like the legacy routes) and inherits the shell for free.
const routes: Routes = [
  {
    path: '',
    component: V2ShellComponent,
    children: [
      { path: '', redirectTo: 'components-gallery', pathMatch: 'full' },
      { path: 'components-gallery', component: ComponentsGalleryComponent },
      // Alias: the gallery was first reachable at /v2/components. Both paths resolve to it
      // so a bookmarked or half-remembered URL never lands on the "not built" placeholder.
      { path: 'components', redirectTo: 'components-gallery', pathMatch: 'full' },
      // Module 1. Feature-flagged: legacy /admin/class stays reachable and unchanged
      // until this page has been checked against its design reference.
      {
        path: 'academic-setup',
        loadChildren: () => import('src/app/academic-setup/academic-setup.module')
          .then((m) => m.AcademicSetupModule)
      },
      // Module 2. Legacy /admin/student pages stay reachable and unchanged until these are
      // verified against their references.
      {
        path: 'student',
        loadChildren: () => import('src/app/student/student.module')
          .then((m) => m.StudentModule)
      },
      // Sidebar entries whose pages don't exist yet land here rather than 404-ing.
      { path: '**', component: NotBuiltComponent }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class V2RoutingModule {}

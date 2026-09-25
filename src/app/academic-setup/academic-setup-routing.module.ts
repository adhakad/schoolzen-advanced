import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ClassesSectionsComponent } from './classes-sections/classes-sections.component';
import { SubjectsComponent } from './subjects/subjects.component';
import { SubjectGroupsComponent } from './subject-groups/subject-groups.component';

// Mounted by v2-routing.module.ts at /v2/academic-setup, so these paths are relative to
// it: 'classes-sections' resolves to /v2/academic-setup/classes-sections, which is what
// the sidebar already links to.
const routes: Routes = [
  { path: '', redirectTo: 'classes-sections', pathMatch: 'full' },
  { path: 'classes-sections', component: ClassesSectionsComponent },
  { path: 'subjects', component: SubjectsComponent },
  { path: 'subject-groups', component: SubjectGroupsComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AcademicSetupRoutingModule {}

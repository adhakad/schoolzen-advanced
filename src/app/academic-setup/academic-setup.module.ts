/**
 * Academic Setup — the first of the thirteen rebuilt modules, and the one every other
 * module's Class/Stream/Section filter reads from.
 *
 * Routing and declarations ONLY. Its service and models live in the shared layer folders
 * (shared/services/academic-setup/, shared/models/academic-setup/) mirroring the backend's
 * controllers/ models/ routes/ exactly — a module folder holds components and nothing
 * else. See docs/schoolzen-planning/v1/_core/frontend-backend-folder-structure.md.
 *
 * One NgModule per module-folder, not one per page: the three pages share a route prefix,
 * so they are declared together here rather than each standing up its own module.
 *
 * SharedComponentsModule supplies the toolbar/table/modal library and re-exports
 * CommonModule and FormsModule, so neither is imported here.
 */
import { NgModule } from '@angular/core';
import { SharedComponentsModule } from 'src/app/shared/shared-components.module';
import { AcademicSetupRoutingModule } from './academic-setup-routing.module';
import { ClassesSectionsComponent } from './classes-sections/classes-sections.component';
import { SubjectsComponent } from './subjects/subjects.component';
import { SubjectGroupsComponent } from './subject-groups/subject-groups.component';

@NgModule({
  declarations: [ClassesSectionsComponent, SubjectsComponent, SubjectGroupsComponent],
  imports: [SharedComponentsModule, AcademicSetupRoutingModule]
})
export class AcademicSetupModule {}

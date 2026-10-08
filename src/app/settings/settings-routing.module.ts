import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AcademicSessionsComponent } from './academic-sessions/academic-sessions.component';
import { AdmissionFormFieldsComponent } from './admission-form-fields/admission-form-fields.component';
import { RolesPermissionsComponent } from './roles-permissions/roles-permissions.component';
import { MarksheetTemplatesComponent } from './marksheet-templates/marksheet-templates.component';

// Mounted by v2-routing.module.ts at /v2/settings — matches the sidebar's routes.
const routes: Routes = [
  { path: '', redirectTo: 'academic-sessions', pathMatch: 'full' },
  { path: 'academic-sessions', component: AcademicSessionsComponent },
  { path: 'admission-form-fields', component: AdmissionFormFieldsComponent },
  { path: 'roles-permissions', component: RolesPermissionsComponent },
  { path: 'marksheet-templates', component: MarksheetTemplatesComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class SettingsRoutingModule {}

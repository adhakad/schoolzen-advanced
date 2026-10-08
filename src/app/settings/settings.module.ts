/**
 * Settings — module 12: Academic Sessions, Admission Form Fields, Roles & Permissions,
 * Marksheet Templates. Routing and declarations ONLY; services/models live in
 * shared/services/settings/ and shared/models/settings/ (frontend-backend-folder-structure.md).
 */
import { NgModule } from '@angular/core';
import { SharedComponentsModule } from 'src/app/shared/shared-components.module';
import { SettingsRoutingModule } from './settings-routing.module';
import { AcademicSessionsComponent } from './academic-sessions/academic-sessions.component';
import { AdmissionFormFieldsComponent } from './admission-form-fields/admission-form-fields.component';
import { RolesPermissionsComponent } from './roles-permissions/roles-permissions.component';
import { MarksheetTemplatesComponent } from './marksheet-templates/marksheet-templates.component';

@NgModule({
  declarations: [
    AcademicSessionsComponent,
    AdmissionFormFieldsComponent,
    RolesPermissionsComponent,
    MarksheetTemplatesComponent
  ],
  imports: [SharedComponentsModule, SettingsRoutingModule]
})
export class SettingsModule {}

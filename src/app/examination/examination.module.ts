/**
 * Examination — Marksheet Structure, Generate Marksheet, Admit Card Structure and Generate
 * Admit Card (module 9).
 *
 * Routing and declarations ONLY. Services and models live in the shared layer folders
 * (shared/services/examination/, shared/models/examination/), mirroring the backend's layout.
 */
import { NgModule } from '@angular/core';
import { SharedComponentsModule } from 'src/app/shared/shared-components.module';
import { ExaminationRoutingModule } from './examination-routing.module';
import { MarksheetStructureComponent } from './marksheet-structure/marksheet-structure.component';
import { GenerateMarksheetComponent } from './generate-marksheet/generate-marksheet.component';
import { AdmitCardStructureComponent } from './admit-card-structure/admit-card-structure.component';
import { GenerateAdmitCardComponent } from './generate-admit-card/generate-admit-card.component';
import { MarksheetDocumentComponent } from './marksheet-document/marksheet-document.component';
import { AdmitCardDocumentComponent } from './admit-card-document/admit-card-document.component';

@NgModule({
  declarations: [
    MarksheetStructureComponent,
    GenerateMarksheetComponent,
    AdmitCardStructureComponent,
    GenerateAdmitCardComponent,
    MarksheetDocumentComponent,
    AdmitCardDocumentComponent
  ],
  imports: [SharedComponentsModule, ExaminationRoutingModule]
})
export class ExaminationModule {}

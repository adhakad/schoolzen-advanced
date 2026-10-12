import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MarksheetStructureComponent } from './marksheet-structure/marksheet-structure.component';
import { GenerateMarksheetComponent } from './generate-marksheet/generate-marksheet.component';
import { AdmitCardStructureComponent } from './admit-card-structure/admit-card-structure.component';
import { GenerateAdmitCardComponent } from './generate-admit-card/generate-admit-card.component';

// Mounted by v2-routing.module.ts at /v2/examination — matches the sidebar's links.
const routes: Routes = [
  { path: '', redirectTo: 'generate-marksheet', pathMatch: 'full' },
  { path: 'admit-card-structure', component: AdmitCardStructureComponent },
  { path: 'generate-admit-card', component: GenerateAdmitCardComponent },
  { path: 'marksheet-structure', component: MarksheetStructureComponent },
  { path: 'generate-marksheet', component: GenerateMarksheetComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ExaminationRoutingModule {}

import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TcStructureComponent } from './tc-structure/tc-structure.component';
import { GenerateTcComponent } from './generate-tc/generate-tc.component';

// Mounted by v2-routing.module.ts at /v2/certificates — matches the sidebar's links.
const routes: Routes = [
  { path: '', redirectTo: 'generate-tc', pathMatch: 'full' },
  { path: 'tc-structure', component: TcStructureComponent },
  { path: 'generate-tc', component: GenerateTcComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class CertificatesRoutingModule {}

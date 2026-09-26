import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ManageStudentsComponent } from './manage-students/manage-students.component';
import { AdmissionComponent } from './admission/admission.component';
import { ClassPromotionComponent } from './class-promotion/class-promotion.component';

// Mounted by v2-routing.module.ts at /v2/student — the paths the sidebar already links to.
const routes: Routes = [
  { path: '', redirectTo: 'manage-students', pathMatch: 'full' },
  { path: 'manage-students', component: ManageStudentsComponent },
  { path: 'admission', component: AdmissionComponent },
  { path: 'class-promotion', component: ClassPromotionComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class StudentRoutingModule {}

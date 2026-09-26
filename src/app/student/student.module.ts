/**
 * Student — module 2 of the rebuild: Manage Students, Admission, Class Promotion.
 *
 * Routing and declarations ONLY. Services and models live in the shared layer folders
 * (shared/services/student/, shared/models/student/), and the pieces the three pages share
 * — the class cascade filter, the student form, the profile view and the letterhead — are
 * shared components, built once (frontend-backend-folder-structure.md).
 *
 * SharedComponentsModule re-exports CommonModule, FormsModule and ReactiveFormsModule.
 */
import { NgModule } from '@angular/core';
import { SharedComponentsModule } from 'src/app/shared/shared-components.module';
import { StudentRoutingModule } from './student-routing.module';
import { ManageStudentsComponent } from './manage-students/manage-students.component';
import { AdmissionComponent } from './admission/admission.component';
import { ClassPromotionComponent } from './class-promotion/class-promotion.component';

@NgModule({
  declarations: [ManageStudentsComponent, AdmissionComponent, ClassPromotionComponent],
  imports: [SharedComponentsModule, StudentRoutingModule]
})
export class StudentModule {}

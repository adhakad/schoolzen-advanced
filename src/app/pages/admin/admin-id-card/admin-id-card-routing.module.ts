import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AdminIdCardComponent } from './admin-id-card.component';

const routes: Routes = [{ path: '', component: AdminIdCardComponent }];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AdminIdCardRoutingModule { }

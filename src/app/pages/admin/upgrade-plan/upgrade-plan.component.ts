import { Component, OnInit } from '@angular/core';
import { PlansService } from 'src/app/services/plans.service';
import { AdminPlanService } from 'src/app/services/admin-plan.service';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';


@Component({
  selector: 'app-upgrade-plan',
  templateUrl: './upgrade-plan.component.html',
  styleUrls: ['./upgrade-plan.component.css']
})
export class UpgradePlanComponent implements OnInit {

  plansInfo: any[] = [];
  adminId!: string;
  adminPlanInfo: any;
  constructor(private plansService: PlansService, private adminAuthService: AdminAuthService, private adminPlanService: AdminPlanService) { }

  ngOnInit(): void {
    let getAdmin = this.adminAuthService.getLoggedInAdminInfo();
    this.adminId = getAdmin?.id;
    this.getPlans();
    this.getSingleAdminPlans();
  }
  getPlans() {
    this.plansService.getPlansList().subscribe((res: any[]) => {
      if (res) {
        this.plansInfo = res;
      }
    })
  }
  getSingleAdminPlans() {
    this.adminPlanService.getSingleAdminPlan(this.adminId).subscribe((res: any) => {
      if (res) {
        this.adminPlanInfo = res;
      }
    })
  }

}

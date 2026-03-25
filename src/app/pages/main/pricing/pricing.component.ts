import { Component, OnInit } from '@angular/core';
import { PlansService } from 'src/app/services/plans.service';

@Component({
  selector: 'app-pricing',
  templateUrl: './pricing.component.html',
  styleUrls: ['./pricing.component.css']
})
export class PricingComponent implements OnInit {
  plansInfo: any[] = [];
  paymentType:any[] = ['annual','one-month-trial','free-trial'];
  constructor(private plansService: PlansService,) { }

  ngOnInit(): void {
    this.getPlans();
  }
  getPlans() {
    this.plansService.getPlansList().subscribe((res: any[]) => {
      if (res) {
        this.plansInfo = res;
      }
    })
  }

}

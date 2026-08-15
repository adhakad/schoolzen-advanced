import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from "rxjs";
import { SalesAuthService } from 'src/app/services/auth/sales-auth.service';

@Component({
  selector: 'app-sales-header-nav',
  templateUrl: './header-nav.component.html',
  styleUrls: ['./header-nav.component.css']
})
export class HeaderNavComponent implements OnInit, OnDestroy {
  salesUserInfo: any;
  nav: boolean = false;

  isSalesAuthenticated = false;
  private authListenerSubs: Subscription | undefined;
  constructor(private salesAuthService: SalesAuthService) { }

  ngOnInit(): void {
    this.nav = false;
    this.salesAuthService.autoAuthSales();
    this.isSalesAuthenticated = this.salesAuthService.getIsAuth();
    this.authListenerSubs = this.salesAuthService
      .getAuthStatusListener()
      .subscribe(isSalesAuthenticated => {
        this.isSalesAuthenticated = isSalesAuthenticated;
      });
    this.salesUserInfo = this.salesAuthService.getLoggedInSalesUserInfo();
  }

  hamburgerMenu(isNavOpen: boolean): void {
    this.nav = !isNavOpen;
  }

  onLogout() {
    this.salesAuthService.logout();
  }

  ngOnDestroy() {
    this.authListenerSubs?.unsubscribe();
  }
}

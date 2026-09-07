/**
 * The routed layout for the whole /v2 route group: the app shell wrapping a
 * <router-outlet>. Every /v2/<module>/<page> is a CHILD of this route, so no page ever
 * declares the header/sidebar itself.
 */
import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-v2-shell',
  template: '<app-page-shell><router-outlet></router-outlet></app-page-shell>',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2ShellComponent {}

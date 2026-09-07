/**
 * Placeholder for a sidebar entry whose page hasn't been built yet — the nav config lists
 * all 13 modules from day one, while pages arrive one prompt at a time. Renders inside the
 * shell so navigation never dead-ends.
 */
import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-not-built',
  template: `
    <div class="sw-card-main" style="text-align:center;padding:48px 20px;">
      <div class="sw-title" style="margin-bottom:6px;">This page isn't built yet</div>
      <div style="font-size:13px;color:#9494ac;">
        The module is listed in the sidebar so the navigation is complete; its page arrives
        with that module's own build step.
      </div>
      <a class="sw-backlink" routerLink="/v2/components-gallery" style="margin-top:16px;">
        <i class="ti ti-arrow-left"></i>Component gallery
      </a>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NotBuiltComponent {}

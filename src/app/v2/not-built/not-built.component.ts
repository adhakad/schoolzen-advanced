/**
 * Placeholder for a sidebar entry whose page hasn't been built yet — the nav config lists
 * all 13 modules from day one, while pages arrive one prompt at a time. Renders inside the
 * shell so navigation never dead-ends.
 */
import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-not-built',
  template: `
    <div class="sw-card-main not-built">
      <div class="sw-title">This page isn't built yet</div>
      <div class="subtitle">
        The module is listed in the sidebar so the navigation is complete; its page arrives
        with that module's own build step.
      </div>
      <a class="back-link" routerLink="/v2/components-gallery">
        <i class="bi bi-arrow-left"></i>Component gallery
      </a>
    </div>
  `,
  styles: [`
    .not-built { text-align: center; padding: 48px 20px; }
    .not-built .back-link { margin-top: 16px; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NotBuiltComponent {}

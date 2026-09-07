/**
 * The sidebar half of the app shell: 13 collapsible module groups (accordion — opening
 * one closes the others), the current page's group auto-expanded.
 *
 * Two role behaviours, straight from the legacy shells and NOT interchangeable:
 *   - an admin-only group/item is removed from the DOM for a teacher (their role simply
 *     has no route for it);
 *   - a permission-gated item stays VISIBLE for a teacher but renders locked — grey, lock
 *     icon, no routerLink, no click — so they can see the feature exists and ask for it.
 *
 * Driven entirely by SHELL_NAV (shared/config/shell-nav.config.ts) and the ShellContext;
 * it holds no per-module knowledge of its own.
 */
import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { SHELL_NAV, ShellNavGroup, ShellNavItem } from 'src/app/shared/config/shell-nav.config';
import { ShellContext } from 'src/app/shared/models/shell-context.model';

interface RenderedItem {
  label: string;
  route: string;
  locked: boolean;
}

interface RenderedGroup {
  key: string;
  label: string;
  icon: string;
  route: string | null;
  items: RenderedItem[];
}

@Component({
  selector: 'app-shell-sidebar',
  templateUrl: './shell-sidebar.component.html',
  styleUrls: ['./shell-sidebar.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ShellSidebarComponent implements OnChanges {
  @Input() context: ShellContext | null = null;
  /** Current router URL — decides the active group/sub-item. */
  @Input() activeUrl = '';

  @Output() navigated = new EventEmitter<void>();

  groups: RenderedGroup[] = [];
  openGroupKey: string | null = null;
  /**
   * The group that CONTAINS the current page — what `.sb-item.parent-active` marks in the
   * reference (its name is literally "parent of the active item"). Deliberately not the
   * same thing as `openGroupKey`: browsing into another group must not move the gradient
   * off the section you are actually on.
   */
  activeGroupKey: string | null = null;
  activeRoute = '';

  ngOnChanges(): void {
    this.groups = this.buildGroups();
    this.activeRoute = this.matchActiveRoute();
    const activeGroup = this.groups.find((group) => this.groupOwnsActiveRoute(group));
    this.activeGroupKey = activeGroup ? activeGroup.key : null;
    // Navigating into a section auto-expands it; an explicit click still wins afterwards.
    if (activeGroup && activeGroup.items.length) this.openGroupKey = activeGroup.key;
  }

  toggleGroup(key: string): void {
    this.openGroupKey = this.openGroupKey === key ? null : key;
  }

  onNavigate(): void {
    this.navigated.emit();
  }

  trackByKey = (_index: number, group: RenderedGroup): string => group.key;
  trackByRoute = (_index: number, item: RenderedItem): string => item.route;

  private buildGroups(): RenderedGroup[] {
    const isAdmin = this.context?.role !== 'teacher';
    const permissions = this.context?.permissions;

    return SHELL_NAV
      .filter((group: ShellNavGroup) => isAdmin || !group.adminOnly)
      .map((group: ShellNavGroup) => ({
        key: group.key,
        label: group.label,
        icon: group.icon,
        route: group.route || null,
        items: (group.items || [])
          .filter((item: ShellNavItem) => isAdmin || !item.adminOnly)
          .map((item: ShellNavItem) => ({
            label: item.label,
            route: item.route,
            // Admin sees everything; a teacher's permission-gated item locks when false.
            locked: !isAdmin && !!item.permission && !permissions?.[item.permission]
          }))
      }))
      // A group whose every item was admin-only has nothing left to show a teacher.
      .filter((group) => group.route !== null || group.items.length > 0);
  }

  private matchActiveRoute(): string {
    const url = this.activeUrl.split('?')[0];
    const routes: string[] = [];
    this.groups.forEach((group) => {
      if (group.route) routes.push(group.route);
      group.items.forEach((item) => routes.push(item.route));
    });
    // Longest match wins, so /v2/payroll/salary-groups doesn't light up /v2/payroll.
    return routes
      .filter((route) => url === route || url.indexOf(route + '/') === 0)
      .sort((a, b) => b.length - a.length)[0] || '';
  }

  private groupOwnsActiveRoute(group: RenderedGroup): boolean {
    if (!this.activeRoute) return false;
    if (group.route === this.activeRoute) return true;
    return group.items.some((item) => item.route === this.activeRoute);
  }
}

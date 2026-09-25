/**
 * app-page-shell — the sidebar + topbar + content slot every page in the new UI renders
 * inside. Built ONCE (this file); no module page carries its own header/sidebar
 * markup, which is what the 35 page references in the planning package were standing in
 * for with a static snapshot.
 *
 * No inputs: it reads the logged-in person, their school, the academic session and their
 * permissions from ShellContextService, which adapts whichever legacy session is active.
 *
 * <app-page-shell><router-outlet></router-outlet></app-page-shell>
 */
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';
import { SHELL_NAV } from 'src/app/shared/config/shell-nav.config';
import { ShellCrumb } from './shell-header/shell-header.component';
import { ShellContext, ShellNotification } from 'src/app/shared/models/shell-context.model';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';

@Component({
  selector: 'app-page-shell',
  templateUrl: './page-shell.component.html',
  styleUrls: ['./page-shell.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PageShellComponent implements OnInit, OnDestroy {
  context: ShellContext | null = null;
  activeUrl = '';
  mobileOpen = false;
  /** 'Academic Setup / Classes & Sections' — derived from the nav config, so a page never
      has to declare its own crumb and the two can never drift apart. */
  crumb: ShellCrumb | null = null;

  /**
   * Placeholder until the unified notifications service exists (see
   * additional-technical-considerations.md) — the bell renders whatever it is given.
   */
  notifications: readonly ShellNotification[] = [];

  private readonly destroy$ = new Subject<void>();

  constructor(
    private shellContext: ShellContextService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.setActiveUrl(this.router.url);

    this.shellContext.context
      .pipe(takeUntil(this.destroy$))
      .subscribe((context) => {
        this.context = context;
        this.cdr.markForCheck();
      });
    this.shellContext.load();

    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd), takeUntil(this.destroy$))
      .subscribe((event) => {
        this.setActiveUrl(event.urlAfterRedirects);
        this.mobileOpen = false;
        this.cdr.markForCheck();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  toggleMobileNav(): void {
    this.mobileOpen = !this.mobileOpen;
  }

  closeMobileNav(): void {
    this.mobileOpen = false;
  }

  onSessionChanged(session: string): void {
    this.shellContext.setActiveSession(session);
  }

  onLogout(): void {
    this.shellContext.logout();
  }

  private setActiveUrl(url: string): void {
    this.activeUrl = url;
    this.crumb = this.resolveCrumb(url.split('?')[0]);
  }

  /**
   * Longest-prefix match against the nav config, so /v2/payroll/salary-groups resolves to
   * its own page rather than to the group's first entry. A route the config doesn't know
   * (the components gallery, the not-built placeholder) simply gets no crumb.
   */
  private resolveCrumb(url: string): ShellCrumb | null {
    const candidates: { route: string; crumb: ShellCrumb }[] = [];

    SHELL_NAV.forEach((group) => {
      if (group.route) candidates.push({ route: group.route, crumb: { group: '', page: group.label } });
      (group.items || []).forEach((item) => {
        candidates.push({ route: item.route, crumb: { group: group.label, page: item.label } });
      });
    });

    const match = candidates
      .filter((candidate) => url === candidate.route || url.indexOf(candidate.route + '/') === 0)
      .sort((a, b) => b.route.length - a.route.length)[0];

    return match ? match.crumb : null;
  }
}

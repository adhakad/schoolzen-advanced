/**
 * app-page-shell — the header + sidebar + spacer + content slot every page in the new UI
 * renders inside. Built ONCE (this file); no module page carries its own header/sidebar
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
    this.activeUrl = this.router.url;

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
        this.activeUrl = event.urlAfterRedirects;
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
}

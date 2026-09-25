/**
 * The topbar half of the app shell: breadcrumb (with the mobile-only hamburger beside it)
 * on the left; session selector -> notification bell -> profile pill on the right.
 *
 * The brand lives in the SIDEBAR, not here — the references put it at the top of the dark
 * column and give the topbar the crumb instead.
 *
 * The profile dropdown is where the SCHOOL's identity lives (logo, name, board/location),
 * followed by My Profile / School Settings (admin only, matching the legacy teacher header
 * having no profile menu at all) / Logout. The legacy "UPGRADE PLAN" button is deliberately
 * not carried over — it is a billing upsell, not part of the product surface.
 *
 * Both dropdowns are `.dd` menus, hidden by CSS until `.dd.open` — the reference's own
 * mechanism, so a page's hand-written `.dd` and this one behave identically.
 */
import {
  ChangeDetectionStrategy, Component, EventEmitter, HostListener, Input, OnChanges, Output
} from '@angular/core';
import { DdOption } from 'src/app/shared/models/shared-components.model';
import { ShellContext, ShellNotification } from 'src/app/shared/models/shell-context.model';

/** 'Academic Setup / <b>Classes &amp; Sections</b>' — resolved by the shell from SHELL_NAV. */
export interface ShellCrumb {
  group: string;
  page: string;
}

@Component({
  selector: 'app-shell-header',
  templateUrl: './shell-header.component.html',
  styleUrls: ['./shell-header.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ShellHeaderComponent implements OnChanges {
  @Input() context: ShellContext | null = null;
  @Input() notifications: readonly ShellNotification[] = [];
  @Input() crumb: ShellCrumb | null = null;

  @Output() menuToggled = new EventEmitter<void>();
  @Output() sessionChanged = new EventEmitter<string>();
  @Output() loggedOut = new EventEmitter<void>();

  bellOpen = false;
  profileOpen = false;

  /** Rebuilt only when the context changes — never a fresh array on every check,
      which would re-run the dropdown's ngOnChanges on each cycle. */
  sessionOptions: DdOption[] = [];

  ngOnChanges(): void {
    this.sessionOptions = (this.context?.sessions || []).map((session) => ({
      value: session,
      label: session
    }));
  }

  get hasUnread(): boolean {
    return this.notifications.some((notification) => notification.unread);
  }

  // stopPropagation, or the document listener below closes what this click just opened.
  toggleBell(event: Event): void {
    event.stopPropagation();
    this.bellOpen = !this.bellOpen;
    this.profileOpen = false;
  }

  toggleProfile(event: Event): void {
    event.stopPropagation();
    this.profileOpen = !this.profileOpen;
    this.bellOpen = false;
  }

  onSessionChange(value: string): void {
    this.sessionChanged.emit(value);
  }

  /** Clicking anywhere outside the header closes whichever dropdown is open. */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.bellOpen && !this.profileOpen) return;
    const target = event.target as HTMLElement | null;
    if (target && target.closest('.topbar')) return;
    this.bellOpen = false;
    this.profileOpen = false;
  }

  trackById = (_index: number, notification: ShellNotification): string => notification.id;

}

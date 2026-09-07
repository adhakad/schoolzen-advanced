/**
 * The header half of the app shell: brand mark -> hamburger (mobile only) -> session
 * selector -> notification bell -> profile pill.
 *
 * The profile dropdown is where the SCHOOL's identity lives (logo, name, board/location),
 * followed by My Profile / School Settings (admin only, matching the legacy teacher header
 * having no profile menu at all) / Logout. The legacy "UPGRADE PLAN" button is deliberately
 * not carried over — it is a billing upsell, not part of the product surface.
 *
 * Both dropdowns lazy-render (*ngIf), so nothing unused sits in the DOM.
 */
import { ChangeDetectionStrategy, Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { ShellContext, ShellNotification } from 'src/app/shared/models/shell-context.model';

@Component({
  selector: 'app-shell-header',
  templateUrl: './shell-header.component.html',
  styleUrls: ['./shell-header.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ShellHeaderComponent {
  @Input() context: ShellContext | null = null;
  @Input() notifications: readonly ShellNotification[] = [];

  @Output() menuToggled = new EventEmitter<void>();
  @Output() sessionChanged = new EventEmitter<string>();
  @Output() loggedOut = new EventEmitter<void>();

  bellOpen = false;
  profileOpen = false;

  get hasUnread(): boolean {
    return this.notifications.some((notification) => notification.unread);
  }

  toggleBell(): void {
    this.bellOpen = !this.bellOpen;
    this.profileOpen = false;
  }

  toggleProfile(): void {
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
    if (target && target.closest('.sw-header, .sw-bell-drop, .sw-profile-drop')) return;
    this.bellOpen = false;
    this.profileOpen = false;
  }

  trackById = (_index: number, notification: ShellNotification): string => notification.id;

  trackBySession = (_index: number, session: string): string => session;
}

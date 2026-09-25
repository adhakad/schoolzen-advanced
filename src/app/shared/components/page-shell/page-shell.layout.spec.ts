import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { ShellContext, SHELL_PERMISSION_KEYS, ShellPermissionKey } from 'src/app/shared/models/shell-context.model';
import { PageShellComponent } from './page-shell.component';
import { ShellHeaderComponent } from './shell-header/shell-header.component';
import { ShellSidebarComponent } from './shell-sidebar/shell-sidebar.component';
import { DdComponent } from '../dd/dd.component';

const permissions = (): Record<ShellPermissionKey, boolean> => {
  const result = {} as Record<ShellPermissionKey, boolean>;
  SHELL_PERMISSION_KEYS.forEach((key) => { result[key] = true; });
  return result;
};

const CONTEXT: ShellContext = {
  role: 'admin',
  displayName: 'Abhishek',
  initials: 'AD',
  school: null,
  sessions: ['2026-27'],
  activeSession: '2026-27',
  permissions: permissions()
};

/** Content tall enough that it must scroll inside its pane rather than growing the page. */
@Component({
  template: `
    <app-page-shell>
      <div class="tall-content" style="height: 4000px;">tall</div>
    </app-page-shell>`
})
class HostComponent {}

/**
 * The shell's LAYOUT contract, measured in a real browser rather than asserted off the
 * stylesheet text:
 *
 *   - the topbar and the sidebar never move, whatever the content does;
 *   - the content pane is the only thing that scrolls;
 *   - the sidebar's own nav scrolls internally when its groups outgrow the viewport,
 *     instead of the page scrolling to reach a lower nav item.
 *
 * These only hold at the persistent-sidebar breakpoint (>=992px). Below it the sidebar is an
 * off-canvas drawer and the document scrolls normally, so every test here is skipped rather
 * than asserted against the wrong shell — run with `--browsers=ChromeHeadlessDesktop`, which
 * karma.conf.js sizes at 1400x900 for exactly this reason.
 */
describe('PageShell layout', () => {
  let fixture: ComponentFixture<HostComponent>;

  const DESKTOP = window.innerWidth >= 992;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonModule, RouterTestingModule],
      declarations: [
        HostComponent, PageShellComponent, ShellHeaderComponent, ShellSidebarComponent, DdComponent
      ],
      providers: [
        {
          provide: ShellContextService,
          useValue: { context: of(CONTEXT), load: () => {}, setActiveSession: () => {}, logout: () => {} }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  const el = (selector: string): HTMLElement => fixture.nativeElement.querySelector(selector);

  it('runs against the persistent-sidebar breakpoint', () => {
    if (!DESKTOP) {
      pending('viewport is ' + window.innerWidth + 'px — run with --browsers=ChromeHeadlessDesktop');
    }
    expect(window.innerWidth).toBeGreaterThanOrEqual(992);
  });

  it('makes the content pane the scroller, not the page', () => {
    if (!DESKTOP) { pending('below 992px'); return; }
    const content = el('.content');

    expect(getComputedStyle(content).overflowY).toBe('auto');
    expect(content.scrollHeight).toBeGreaterThan(content.clientHeight);
    // The frame itself cannot scroll, so nothing can push the header or sidebar off-screen.
    expect(getComputedStyle(el('.sz')).overflow).toBe('hidden');
  });

  it('keeps the topbar and the sidebar still while the content scrolls', () => {
    if (!DESKTOP) { pending('below 992px'); return; }
    const content = el('.content');
    const topbarBefore = el('.topbar').getBoundingClientRect();
    const sidebarBefore = el('.sidebar').getBoundingClientRect();

    content.scrollTop = 1200;
    fixture.detectChanges();

    expect(content.scrollTop).toBe(1200);
    const topbarAfter = el('.topbar').getBoundingClientRect();
    const sidebarAfter = el('.sidebar').getBoundingClientRect();

    expect(topbarAfter.top).toBe(topbarBefore.top);
    expect(sidebarAfter.top).toBe(sidebarBefore.top);
    expect(sidebarAfter.left).toBe(sidebarBefore.left);
  });

  it('leaves the content pane below the topbar and beside the sidebar, never under them', () => {
    if (!DESKTOP) { pending('below 992px'); return; }
    const topbar = el('.topbar').getBoundingClientRect();
    const sidebar = el('.sidebar').getBoundingClientRect();
    const content = el('.content').getBoundingClientRect();

    // No overlap, and no gap to fall through either — the panes meet exactly.
    expect(content.top).toBe(topbar.bottom);
    expect(content.left).toBe(sidebar.right);
  });

  it('gives the sidebar the full viewport height', () => {
    if (!DESKTOP) { pending('below 992px'); return; }
    expect(el('.sidebar').getBoundingClientRect().height).toBe(window.innerHeight);
  });

  // --- below 992px: the frame is unwound and the sidebar becomes a drawer -----------------
  //
  // The mirror image of everything above, so a desktop-only change cannot quietly break the
  // drawer. Run with `--browsers=ChromeHeadlessMobile`.

  it('hands scrolling back to the document below 992px', () => {
    if (DESKTOP) { pending('at or above 992px'); return; }

    // The viewport frame is off: the page scrolls, not a pane inside it.
    expect(getComputedStyle(el('.sz')).overflow).toBe('visible');
    expect(getComputedStyle(el('.content')).overflowY).toBe('visible');
  });

  it('keeps the topbar visible below 992px by making it sticky', () => {
    if (DESKTOP) { pending('at or above 992px'); return; }
    expect(getComputedStyle(el('.topbar')).position).toBe('sticky');
  });

  it('parks the sidebar off-canvas below 992px until the drawer opens', () => {
    if (DESKTOP) { pending('at or above 992px'); return; }
    const sidebar = el('.sidebar');

    expect(getComputedStyle(sidebar).position).toBe('fixed');
    // Translated fully out of view, so it takes no layout room from the content.
    expect(sidebar.getBoundingClientRect().right).toBeLessThanOrEqual(0);

    // The drawer slides in over 220ms, so measure its END state rather than racing the
    // transition — a rect read on the next line is still the interpolated start value.
    sidebar.style.transition = 'none';
    el('.sz').classList.add('nav-open');

    expect(sidebar.getBoundingClientRect().left).toBe(0);
    // Still fixed, so opening the drawer never reflows the content behind it.
    expect(getComputedStyle(sidebar).position).toBe('fixed');
  });

  it('shows the hamburger only below 992px', () => {
    const hamburger = getComputedStyle(el('.hamburger')).display;
    expect(hamburger).toBe(DESKTOP ? 'none' : 'flex');
  });

  /**
   * The specific thing asked for: a nav taller than the viewport scrolls INSIDE the sidebar.
   * Every group is expanded here to force it well past the available height.
   */
  it('scrolls a too-tall nav inside the sidebar instead of scrolling the page', () => {
    if (!DESKTOP) { pending('below 992px'); return; }
    const nav = el('.sidebar nav');

    // Force the nav past the viewport without depending on how many groups happen to fit.
    // This stands in for "every module group expanded at once".
    const filler = document.createElement('div');
    filler.style.height = '3000px';
    nav.appendChild(filler);

    // The filler must actually take the height it asks for. It is a flex child, and a
    // column flex container shrinks its children by default — which is exactly how a
    // too-tall nav used to compress itself instead of scrolling.
    expect(filler.getBoundingClientRect().height).toBe(3000);

    expect(getComputedStyle(nav).overflowY).toBe('auto');
    expect(nav.scrollHeight).toBeGreaterThan(nav.clientHeight);

    const sidebarBefore = el('.sidebar').getBoundingClientRect();
    nav.scrollTop = 400;

    expect(nav.scrollTop).toBe(400);
    // The sidebar stays exactly where it was; only its nav moved.
    expect(el('.sidebar').getBoundingClientRect().top).toBe(sidebarBefore.top);
    expect(document.scrollingElement!.scrollTop).toBe(0);
  });
});

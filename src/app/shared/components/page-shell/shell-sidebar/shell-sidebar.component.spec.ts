import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { RouterTestingModule } from '@angular/router/testing';
import { ShellSidebarComponent } from './shell-sidebar.component';
import { ShellContext, ShellPermissionKey, SHELL_PERMISSION_KEYS } from 'src/app/shared/models/shell-context.model';

const permissions = (value: boolean, overrides: Partial<Record<ShellPermissionKey, boolean>> = {}) => {
  const result = {} as Record<ShellPermissionKey, boolean>;
  SHELL_PERMISSION_KEYS.forEach((key) => { result[key] = value; });
  return { ...result, ...overrides };
};

const context = (partial: Partial<ShellContext>): ShellContext => ({
  role: 'admin',
  displayName: 'Abhishek',
  initials: 'AD',
  school: null,
  sessions: ['2026-27'],
  activeSession: '2026-27',
  permissions: permissions(true),
  ...partial
});

describe('ShellSidebarComponent', () => {
  let fixture: ComponentFixture<ShellSidebarComponent>;
  let component: ShellSidebarComponent;

  /** What a real template binding does: ngOnChanges, mark the OnPush view dirty, run CD. */
  const sync = () => {
    component.ngOnChanges();
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonModule, RouterTestingModule],
      declarations: [ShellSidebarComponent]
    }).compileComponents();
    fixture = TestBed.createComponent(ShellSidebarComponent);
    component = fixture.componentInstance;
  });

  /**
   * Expands a group the way a user does. A real DOM click also marks the OnPush view
   * dirty, which calling toggleGroup() directly does not — and the sub-items are now
   * behind an *ngIf rather than merely collapsed by CSS, so the render has to happen.
   */
  const openGroup = (label: string): void => {
    const button = Array.from(fixture.nativeElement.querySelectorAll('button.nav-item'))
      .find((element) => (element as HTMLElement).textContent!.trim().startsWith(label)) as HTMLButtonElement;
    button.click();
    fixture.detectChanges();
  };

  const labels = (selector: string): string[] =>
    Array.from(fixture.nativeElement.querySelectorAll(selector))
      .map((element) => (element as HTMLElement).textContent!.trim());

  it('shows all 13 groups to an admin', () => {
    component.context = context({ role: 'admin' });
    sync();
    expect(component.groups.length).toBe(13);
  });

  it('removes admin-only groups and items entirely for a teacher', () => {
    component.context = context({ role: 'teacher', permissions: permissions(true) });
    sync();

    const keys = component.groups.map((group) => group.key);
    ['academic', 'holiday', 'settings'].forEach((key) => expect(keys).not.toContain(key));

    const staff = component.groups.find((group) => group.key === 'staff');
    // Every Staff item is admin-only, so the group has nothing left to show.
    expect(staff).toBeUndefined();

    const attendance = component.groups.find((group) => group.key === 'attendance');
    expect(attendance!.items.map((item) => item.label)).toEqual(['Overview']);
  });

  it('locks a permission-gated item for a teacher instead of hiding it', () => {
    component.context = context({
      role: 'teacher',
      permissions: permissions(true, { admission: false })
    });
    sync();

    const student = component.groups.find((group) => group.key === 'student')!;
    const admission = student.items.find((item) => item.label === 'Admission')!;
    expect(admission.locked).toBeTrue();
    expect(student.items.find((item) => item.label === 'Manage Students')!.locked).toBeFalse();

    openGroup('Student');

    // The locked entry is rendered, but as a non-navigating link with a lock icon.
    expect(labels('.nav-sub a.locked')).toContain('Admission');
    expect(fixture.nativeElement.querySelector('.nav-sub a.locked i').className).toContain('bi-lock-fill');
    // Visible, but not a link: no routerLink and no click handler.
    expect(fixture.nativeElement.querySelector('.nav-sub a.locked').getAttribute('href')).toBeNull();
  });

  it('auto-expands the group owning the active route and matches the longest route', () => {
    component.context = context({ role: 'admin' });
    component.activeUrl = '/v2/payroll/salary-groups';
    sync();

    expect(component.openGroupKey).toBe('payroll');
    expect(component.activeGroupKey).toBe('payroll');
    expect(component.activeRoute).toBe('/v2/payroll/salary-groups');
  });

  it('keeps the active gradient on the page you are on while another group is browsed', () => {
    component.context = context({ role: 'admin' });
    component.activeUrl = '/v2/payroll/salary-groups';
    sync();

    // A click is not an input change: calling ngOnChanges here would re-run the
    // auto-expand and undo it.
    openGroup('Fees');

    // Opening Fees expands it, but Payroll is still the page you are on.
    expect(component.openGroupKey).toBe('fees');
    expect(component.activeGroupKey).toBe('payroll');
    const active = fixture.nativeElement.querySelectorAll('.nav-item.active');
    expect(active.length).toBe(1);
    expect((active[0] as HTMLElement).textContent).toContain('Payroll');
  });

  it('keeps the accordion to one open group at a time', () => {
    component.context = context({ role: 'admin' });
    sync();

    component.toggleGroup('student');
    expect(component.openGroupKey).toBe('student');
    component.toggleGroup('fees');
    expect(component.openGroupKey).toBe('fees');
    component.toggleGroup('fees');
    expect(component.openGroupKey).toBeNull();
  });

  /**
   * The reference's sub-items are plain text — no leading icon, no dot. The ONLY icon a
   * sub-item ever carries is the lock on a permission-gated one, which is the next test.
   */
  it('renders sub-items as plain text, with no icon of their own', () => {
    component.context = context({ role: 'admin' });
    sync();
    openGroup('Student');

    const subItems = fixture.nativeElement.querySelectorAll('.nav-sub a');
    expect(subItems.length).toBeGreaterThan(0);

    subItems.forEach((subItem: HTMLElement) => {
      expect(subItem.querySelector('i')).withContext(subItem.textContent || '').toBeNull();
    });
  });

  it('shows a lock on a permission-gated item, leaving it visible', () => {
    component.context = context({ role: 'teacher', permissions: permissions(true, { admission: false }) });
    sync();
    openGroup('Student');

    const locked = fixture.nativeElement.querySelector('.nav-sub a.locked i') as HTMLElement;
    expect(locked.className).toContain('bi-lock-fill');
    // The item stays VISIBLE — a teacher should see the feature exists and ask for access.
    expect(getComputedStyle(locked).display).not.toBe('none');
  });
});

/**
 * "No holiday template" warning — shown on Leave Requests and Attendance Overview while any
 * active staff member or this session's student has no Holiday Template. Those people follow
 * the school's Default template (Sunday off), which is rarely the real calendar.
 *
 * Counts only, from /api/v2/holiday/coverage. Renders nothing when everyone is covered or
 * the count can't be loaded — a missing banner never blocks the page.
 */
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnDestroy
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { HolidayAssignService } from 'src/app/shared/services/holiday/holiday-assign.service';

const plural = (count: number, one: string, many: string): string => count + ' ' + (count === 1 ? one : many);

@Component({
  selector: 'app-holiday-coverage-banner',
  templateUrl: './holiday-coverage-banner.component.html',
  styleUrls: ['./holiday-coverage-banner.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HolidayCoverageBannerComponent implements OnChanges, OnDestroy {
  /** The header's session label — student coverage is per session. */
  @Input() session = '';

  text = '';
  private destroyed$ = new Subject<void>();
  private request$ = new Subject<void>();

  constructor(
    private api: HolidayAssignService,
    private adminAuthService: AdminAuthService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnChanges(): void {
    const adminId = this.adminAuthService.getLoggedInAdminInfo()?.id || '';
    if (!adminId) return;
    this.request$.next();
    this.api.getCoverage(adminId, this.session).pipe(takeUntil(this.request$), takeUntil(this.destroyed$)).subscribe((res) => {
      const parts: string[] = [];
      if (res.unassignedStaff) parts.push(plural(res.unassignedStaff, 'staff member', 'staff members'));
      if (res.unassignedStudents) parts.push(plural(res.unassignedStudents, 'student', 'students'));
      this.text = parts.join(' and ');
      this.cdr.markForCheck();
    }, () => {
      this.text = '';
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.request$.next();
    this.destroyed$.next();
    this.destroyed$.complete();
  }
}

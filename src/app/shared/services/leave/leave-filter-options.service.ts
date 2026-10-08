/**
 * The lookups behind Leave's shared Person Type filter (Requests + Assign): departments and
 * designations (Staff's cached option lists) and the class tree + groups (Student's cached
 * filter options). Each piece degrades to empty on failure, flagged so the page can offer
 * a retry — never a broken toolbar.
 */
import { Injectable } from '@angular/core';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { DepartmentsService } from 'src/app/shared/services/staff/departments.service';
import { DesignationsService } from 'src/app/shared/services/staff/designations.service';
import { StudentOptionsService } from 'src/app/shared/services/student/student-options.service';
import { PersonFilterOptions } from 'src/app/shared/models/leave/person-filter.model';

@Injectable({ providedIn: 'root' })
export class LeaveFilterOptionsService {
  constructor(
    private departments: DepartmentsService,
    private designations: DesignationsService,
    private studentOptions: StudentOptionsService
  ) {}

  load(adminId: string): Observable<{ options: PersonFilterOptions; complete: boolean }> {
    return forkJoin({
      departments: this.departments.getOptions(adminId).pipe(catchError(() => of(null))),
      designations: this.designations.getOptions(adminId).pipe(catchError(() => of(null))),
      classes: this.studentOptions.getFilterOptions(adminId).pipe(catchError(() => of(null)))
    }).pipe(map((res) => ({
      complete: Boolean(res.departments && res.designations && res.classes),
      options: {
        departments: ((res.departments?.rows || []) as { _id: string; name: string }[]).map((row) => ({ _id: row._id, name: row.name })),
        designations: ((res.designations?.rows || []) as { _id: string; title: string; departmentId: string | null }[])
          .map((row) => ({ _id: row._id, title: row.title, departmentId: row.departmentId })),
        classes: res.classes?.classes || [],
        groups: res.classes?.groups || []
      }
    })));
  }
}

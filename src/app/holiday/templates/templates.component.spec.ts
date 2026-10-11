import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { HolidaysService } from 'src/app/shared/services/holiday/holidays.service';
import { HolidayTemplatesService } from 'src/app/shared/services/holiday/holiday-templates.service';
import { HolidayTemplate } from 'src/app/shared/models/holiday/holiday-template.model';
import { HolidayTemplatesComponent } from './templates.component';

const template: HolidayTemplate = {
  _id: 't1', name: 'School 2026', holidayIds: ['h1'],
  createdAt: '2026-03-15T00:00:00Z', holidayCount: 1, assignedCount: 3
};

describe('HolidayTemplatesComponent', () => {
  let fixture: ComponentFixture<HolidayTemplatesComponent>;
  let component: HolidayTemplatesComponent;
  let api: jasmine.SpyObj<HolidayTemplatesService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<HolidayTemplatesService>('HolidayTemplatesService', ['getTemplates', 'createTemplate', 'updateTemplate', 'deleteTemplate']);
    api.getTemplates.and.returnValue(of({ rows: [template], total: 1, page: 1, limit: 10, summary: { total: 1 } }));
    api.updateTemplate.and.returnValue(of({ message: 'Template updated successfully.', template }));
    await TestBed.configureTestingModule({
      declarations: [HolidayTemplatesComponent],
      providers: [
        { provide: HolidayTemplatesService, useValue: api },
        {
          provide: HolidaysService,
          useValue: {
            getOptions: () => of({
              rows: [
                { _id: 'h1', name: 'Diwali', startDate: '2026-11-08', endDate: '2026-11-09', days: 2, source: 'manual' },
                { _id: 'h2', name: 'Holi', startDate: '2026-03-04', endDate: '2026-03-04', days: 1, source: 'auto' }
              ]
            })
          }
        },
        { provide: MatSnackBar, useValue: { open: () => undefined } },
        { provide: AdminAuthService, useValue: { getLoggedInAdminInfo: () => ({ id: 'a1' }) } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(HolidayTemplatesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('editing sends holiday ids by reference (no weekly off), then refetches the list', () => {
    component.onEdit(component.rows[0]);
    component.toggleHoliday('h2');
    component.onFormSubmit();
    const [id, body] = api.updateTemplate.calls.mostRecent().args;
    expect(id).toBe('t1');
    expect(body.holidayIds.sort()).toEqual(['h1', 'h2']);
    expect(Object.keys(body)).not.toContain('weeklyOffDays');
    expect(api.getTemplates).toHaveBeenCalledTimes(2);
  });

  it('a template still assigned to people is blocked from delete', () => {
    component.onDelete(component.rows[0]);
    expect(component.confirmConfig.blocked).toBeTrue();
    component.onConfirmed();
    expect(api.deleteTemplate).not.toHaveBeenCalled();
  });
});

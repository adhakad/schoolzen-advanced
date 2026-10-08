import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of, throwError } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { MarksheetTemplatesService } from 'src/app/shared/services/settings/marksheet-templates.service';
import { ApiError } from 'src/app/shared/models/api-error.model';
import { AssignPreview, MarksheetTemplate } from 'src/app/shared/models/settings/marksheet-template.model';
import { MarksheetTemplatesComponent } from './marksheet-templates.component';

const tpl = (code: string, usedBy: number): MarksheetTemplate => ({
  _id: 'id-' + code, code, name: code, terms: ['Half-Yearly'], gradeScale: 'A+ to F', theoryMax: 100, theoryPass: 33,
  practicalMax: null, coScholasticAreas: ['Discipline'], supplyLimit: 2, gradeRows: [['A+', 91, 100]],
  usedBy, usedByClasses: usedBy ? ['8th'] : []
});
const T1 = tpl('T1', 1);
const T2 = tpl('T2', 0);
const CLASSES = [
  { _id: 'c8', label: '8th', hasStreams: false, sections: [], streams: [] },
  { _id: 'c11', label: '11th', hasStreams: true, sections: [], streams: [{ _id: 'sci', label: 'Science', sections: [] }] }
];
const CLEAN: AssignPreview = { usedByOthers: 0, reassignWarning: null, existing: null, subjectGroupMissing: null };

describe('MarksheetTemplatesComponent', () => {
  let fixture: ComponentFixture<MarksheetTemplatesComponent>;
  let component: MarksheetTemplatesComponent;
  let api: jasmine.SpyObj<MarksheetTemplatesService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<MarksheetTemplatesService>('MarksheetTemplatesService', ['getTemplates', 'getAssignPreview', 'assign']);
    api.getTemplates.and.returnValue(of({ templates: [T1, T2], classes: CLASSES }));
    api.getAssignPreview.and.returnValue(of(CLEAN));
    api.assign.and.returnValue(of({ message: 'T2 assigned.' }));

    await TestBed.configureTestingModule({
      declarations: [MarksheetTemplatesComponent],
      providers: [
        { provide: MarksheetTemplatesService, useValue: api },
        { provide: MatSnackBar, useValue: { open: () => undefined } },
        { provide: AdminAuthService, useValue: { getLoggedInAdminInfo: () => ({ id: 'a1' }) } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(MarksheetTemplatesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('an in-use card opens the preview; an unused one opens Use This Template', () => {
    component.onCardClick(T1);
    expect(component.viewOpen).toBe(true);
    component.useFromView();
    expect(component.assignOpen).toBe(true);
    expect(component.assigning?.code).toBe('T1');
  });

  it('a streamed class needs its stream before anything is checked or assignable', () => {
    component.openAssign(T2);
    component.onClassChange('c11');
    expect(api.getAssignPreview).not.toHaveBeenCalled();
    expect(component.submitDisabled).toBe(true);
    component.onStreamChange('sci');
    expect(api.getAssignPreview).toHaveBeenCalledWith('a1', 'id-T2', 'c11', 'sci');
  });

  it('assigns after a clean preview', () => {
    component.openAssign(T2);
    component.onClassChange('c8');
    expect(component.submitDisabled).toBe(false);
    component.onAssignSubmit();
    expect(api.assign).toHaveBeenCalledWith({ adminId: 'a1', templateId: 'id-T2', classId: 'c8', streamId: null, replace: false });
    expect(component.assignOpen).toBe(false);
  });

  it('SUBJECT_GROUP_MISSING blocks the assignment upfront', () => {
    api.getAssignPreview.and.returnValue(of({ ...CLEAN,
      subjectGroupMissing: { code: 'SUBJECT_GROUP_MISSING', message: "Set up this class's subject group first." } }));
    component.openAssign(T2);
    component.onClassChange('c8');
    expect(component.submitDisabled).toBe(true);
  });

  it('CLASS_TEMPLATE_ALREADY_ASSIGNED: replacing needs an explicit yes, then sends replace:true', () => {
    api.getAssignPreview.and.returnValue(of({ ...CLEAN, existing: {
      code: 'CLASS_TEMPLATE_ALREADY_ASSIGNED', message: 'already has a template', templateId: 'id-T1',
      templateCode: 'T1', sameTemplate: false, note: 'regenerates' } }));
    component.openAssign(T2);
    component.onClassChange('c8');
    expect(component.submitDisabled).toBe(true);
    component.replaceConfirmed = true;
    component.onAssignSubmit();
    expect(api.assign.calls.mostRecent().args[0].replace).toBe(true);
  });

  it('TEMPLATE_REASSIGN_WARNING is shown but does not block', () => {
    api.getAssignPreview.and.returnValue(of({ ...CLEAN, usedByOthers: 2,
      reassignWarning: { code: 'TEMPLATE_REASSIGN_WARNING', message: 'used by 2 other classes' } }));
    component.openAssign(T1);
    component.onClassChange('c8');
    expect(component.preview?.reassignWarning?.message).toContain('2 other classes');
    expect(component.submitDisabled).toBe(false);
  });

  it('a race-lost CLASS_TEMPLATE_ALREADY_ASSIGNED re-checks the class and keeps the modal open', () => {
    const err: ApiError = { category: 'ConflictError', code: 'CLASS_TEMPLATE_ALREADY_ASSIGNED', message: 'already assigned', requestId: 'r' };
    api.assign.and.returnValue(throwError(() => err));
    component.openAssign(T2);
    component.onClassChange('c8');
    api.getAssignPreview.calls.reset();
    component.onAssignSubmit();
    expect(component.assignOpen).toBe(true);
    expect(component.assignError).toBe('already assigned');
    expect(api.getAssignPreview).toHaveBeenCalled();
  });

  it('a failed load is an error state, not an empty gallery', () => {
    api.getTemplates.and.returnValue(throwError(() => new Error('down')));
    component.fetchTemplates();
    expect(component.loadError).toContain("Couldn't load");
  });
});

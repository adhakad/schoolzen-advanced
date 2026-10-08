import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of, throwError } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { AdmissionFormFieldsService } from 'src/app/shared/services/settings/admission-form-fields.service';
import { ApiError } from 'src/app/shared/models/api-error.model';
import { FieldConfigResponse, FieldConfigRow } from 'src/app/shared/models/settings/field-config.model';
import { AdmissionFormFieldsComponent, describeRule } from './admission-form-fields.component';

const row = (over: Partial<FieldConfigRow>): FieldConfigRow => ({
  fieldKey: 'x', label: 'X', group: 'student', displayGroup: 'student', required: false, visible: true,
  locked: false, fixed: false, isCustom: false, stateSpecific: null, validationRule: { type: 'text' },
  editableRuleKeys: ['minLength', 'maxLength', 'pattern'], dataCount: 0, version: 0, ...over
});

const NAME = row({ fieldKey: 'name', label: 'Name', displayGroup: 'always', locked: true, required: true });
const ADM = row({ fieldKey: 'admissionNo', label: 'Admission No.', displayGroup: 'admission', fixed: true });
const LAST = row({ fieldKey: 'lastSchool', label: 'Last School', validationRule: { type: 'text', maxLength: 50 }, version: 3 });
const BLOOD = row({ fieldKey: 'bloodGroup', label: 'Blood Group', isCustom: true, dataCount: 7, version: 1,
  validationRule: { type: 'dropdown', options: ['A+', 'B+', 'O+'] }, editableRuleKeys: ['options'] });
const SAMAGRA = row({ fieldKey: 'samagraId', label: 'Samagra ID', displayGroup: 'state', stateSpecific: 'Madhya Pradesh' });

const RESPONSE: FieldConfigResponse = {
  fields: [NAME, ADM, LAST, BLOOD, SAMAGRA],
  schoolState: 'Madhya Pradesh',
  states: ['Madhya Pradesh', 'Bihar'],
  groups: ['always', 'student', 'state', 'parents', 'parentsContact', 'admission'],
  customGroups: ['student', 'parents', 'parentsContact', 'admission'],
  customTypes: ['text', 'number', 'date', 'dropdown'],
  summary: { total: 5, custom: 1 }
};

const apiError = (category: ApiError['category'], code: string, extra: Partial<ApiError> = {}): ApiError =>
  ({ category, code, message: 'msg ' + code, requestId: 'r', ...extra });

describe('AdmissionFormFieldsComponent', () => {
  let fixture: ComponentFixture<AdmissionFormFieldsComponent>;
  let component: AdmissionFormFieldsComponent;
  let api: jasmine.SpyObj<AdmissionFormFieldsService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<AdmissionFormFieldsService>('AdmissionFormFieldsService',
      ['getFields', 'createField', 'saveChanges', 'getImpact', 'deleteField']);
    api.getFields.and.returnValue(of(RESPONSE));
    api.saveChanges.and.returnValue(of({}));

    await TestBed.configureTestingModule({
      declarations: [AdmissionFormFieldsComponent],
      providers: [
        { provide: AdmissionFormFieldsService, useValue: api },
        { provide: MatSnackBar, useValue: { open: () => undefined } },
        { provide: AdminAuthService, useValue: { getLoggedInAdminInfo: () => ({ id: 'a1' }) } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(AdmissionFormFieldsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('defaults the state picker to the school`s state and splits state fields by it', () => {
    expect(component.selectedState).toBe('Madhya Pradesh');
    expect(component.stateFields.map((f) => f.fieldKey)).toEqual(['samagraId']);
    component.onStateChange('Bihar');
    expect(component.otherStateFields.map((f) => f.fieldKey)).toEqual(['samagraId']);
  });

  it('FIELD_LOCKED: locked and fixed fields can`t be staged hidden or optional', () => {
    component.onRequiredToggle(NAME, false);
    component.onVisibleToggle(NAME);
    component.onVisibleToggle(ADM);
    expect(component.dirtyCount).toBe(0);
  });

  it('stages toggles and sends them in ONE Save Changes with each row`s version', () => {
    component.onRequiredToggle(LAST, true);
    component.onVisibleToggle(LAST);
    component.onVisibleToggle(BLOOD);
    component.onVisibleToggle(BLOOD); // flipped back = no change
    expect(component.dirtyCount).toBe(1);

    component.onSaveChanges();
    expect(api.saveChanges).toHaveBeenCalledOnceWith('a1',
      [{ fieldKey: 'lastSchool', version: 3, required: true, visible: false }]);
    expect(component.dirtyCount).toBe(0);
  });

  it('a refused save marks each failing row, and FIELD_CONFIG_CHANGED offers a refresh', () => {
    api.saveChanges.and.returnValue(throwError(() => apiError('ConflictError', 'FIELD_CONFIG_CHANGED',
      { rows: [{ id: 'lastSchool', code: 'FIELD_CONFIG_CHANGED', message: 'changed by someone else' }] })));
    component.onRequiredToggle(LAST, true);
    component.onSaveChanges();

    expect(component.rowErrors['lastSchool']).toBe('changed by someone else');
    expect(component.configChanged).toBe(true);
    expect(component.dirtyCount).toBe(1);

    api.getFields.calls.reset();
    component.refreshAfterConflict();
    expect(component.dirtyCount).toBe(0);
    expect(api.getFields).toHaveBeenCalled();
  });

  it('FIELD_OPTION_REMOVAL_UNSAFE: the gear modal shows the live count and needs consent before staging', fakeAsync(() => {
    api.getImpact.and.returnValue(of({ dataCount: 7, typeChange: null,
      optionRemoval: { removed: ['O+'], count: 2, message: "2 student records use an option you're removing" } }));
    component.onEditField(BLOOD);
    tick(300);
    component.onOptionsChange(['A+', 'B+']);
    tick(300);

    expect(api.getImpact).toHaveBeenCalledWith('a1', 'bloodGroup', { options: ['A+', 'B+'] });
    expect(component.modalSubmitDisabled).toBe(true);
    component.ackOptionRemoval = true;
    expect(component.modalSubmitDisabled).toBe(false);

    component.onModalSubmit();
    component.onSaveChanges();
    const sent = api.saveChanges.calls.mostRecent().args[1][0];
    expect(sent.validationRule?.options).toEqual(['A+', 'B+']);
    expect(sent.acknowledgeOptionRemoval).toBe(true);
  }));

  it('FIELD_TYPE_CHANGE_UNSAFE: a lossy type change on a field with data can`t be staged', fakeAsync(() => {
    api.getImpact.and.returnValue(of({ dataCount: 7, optionRemoval: null,
      typeChange: { blocked: true, count: 7, message: 'may make existing data invalid' } }));
    component.onEditField(BLOOD);
    tick(300);
    component.onTypeChange('number');
    tick(300);
    expect(component.impactBlocks).toBe(true);
    expect(component.modalSubmitDisabled).toBe(true);
  }));

  it('FIELD_KEY_DUPLICATE on Add Custom Field lands under the label input', () => {
    api.createField.and.returnValue(throwError(() => apiError('ConflictError', 'FIELD_KEY_DUPLICATE',
      { fields: [{ field: 'label', message: 'A field with this key already exists.', code: 'FIELD_KEY_DUPLICATE' }] })));
    component.onAddCustomField();
    expect(component.modalSubmitDisabled).toBe(true); // FIELD_DEFINITION_INVALID: no name yet
    component.onLabelChange('Blood Group');
    component.onModalSubmit();
    expect(component.mFieldErrors['label']).toBe('A field with this key already exists.');
    expect(component.modalOpen).toBe(true);
  });

  it('adds a state-specific field for the picked state', () => {
    api.createField.and.returnValue(of({}));
    component.onAddStateField();
    component.onLabelChange('Child ID');
    component.onModalSubmit();
    expect(api.createField.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({
      label: 'Child ID', type: 'text', stateSpecific: 'Madhya Pradesh'
    }));
  });

  it('FIELD_HAS_DATA: deleting a custom field with student data is blocked upfront', () => {
    component.onDeleteField(BLOOD);
    expect(component.confirmConfig.blocked).toBe(true);
    expect(component.confirmConfig.message).toContain('7 student records');
  });

  it('describes rules in plain words', () => {
    expect(describeRule(LAST)).toBe('text · max 50 characters');
    expect(describeRule(SAMAGRA)).toBe('Madhya Pradesh only · text');
  });
});

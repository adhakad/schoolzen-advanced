import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { SchoolProfileService } from 'src/app/shared/services/settings/school-profile.service';
import { SchoolProfile, SchoolProfileResponse } from 'src/app/shared/models/settings/school-profile.model';
import { SchoolProfileComponent, boardShort, initialsOf, letterheadLines } from './school-profile.component';

const LISTS: Omit<SchoolProfileResponse, 'profile'> = {
  boards: [{ label: 'National', boards: ['Central Board of Secondary Education (CBSE)'] }],
  states: ['Madhya Pradesh'],
  mediums: ['English', 'Hindi', 'Hindi & English']
};
const VALID = {
  schoolName: 'Green Valley Public School', board: 'Central Board of Secondary Education (CBSE)', medium: 'English',
  affiliationNumber: '1030123', schoolCode: 'GV-0142', foundedYear: '1998', udiseNumber: '', principalName: '',
  street: '12, Vijay Nagar Main Road', city: 'Indore', district: 'Indore', state: 'Madhya Pradesh', pinCode: '452010',
  phoneOne: '9876543210', phoneSecond: '', email: 'office@greenvalley.in', website: '', senderName: ''
};
const SAVED: SchoolProfile = {
  ...VALID, foundedYear: 1998, udiseNumber: null, principalName: null, phoneSecond: null, website: null,
  senderName: 'Green Valley Public School', schoolLogo: null, updatedAt: new Date().toISOString(), updatedByName: 'School Owner'
};

describe('SchoolProfileComponent', () => {
  let fixture: ComponentFixture<SchoolProfileComponent>;
  let component: SchoolProfileComponent;
  let api: jasmine.SpyObj<SchoolProfileService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<SchoolProfileService>('SchoolProfileService', ['get', 'save']);
    api.get.and.returnValue(of({ profile: null, ...LISTS }));
    api.save.and.returnValue(of({ message: 'School profile saved', profile: SAVED }));
    await TestBed.configureTestingModule({
      declarations: [SchoolProfileComponent],
      imports: [ReactiveFormsModule],
      providers: [
        { provide: SchoolProfileService, useValue: api },
        { provide: AdminAuthService, useValue: { getLoggedInAdminInfo: () => ({ id: 'a1' }) } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(SchoolProfileComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('empty state: no profile, Save disabled, preview prints "SCHOOL"', () => {
    expect(component.profile).toBeNull();
    expect(component.canSave).toBeFalse();
    expect(component.displayName).toBe('SCHOOL');
    expect(component.metaLine).toBe('Not saved yet');
  });

  it('preview lines follow the reference rules (board short, district hidden when = city)', () => {
    expect(boardShort('Central Board of Secondary Education (CBSE)')).toBe('CBSE');
    expect(initialsOf('Green Valley Public School')).toBe('GV');
    expect(letterheadLines({ ...VALID })).toEqual({
      sub: 'CBSE · Affil./Recog. No. 1030123 · School Code GV-0142',
      address: '12, Vijay Nagar Main Road, Indore, Madhya Pradesh - 452010',
      contact: '9876543210 · office@greenvalley.in'
    });
    expect(letterheadLines({ ...VALID, district: 'Dewas' }).address).toContain('Indore, Dewas, Madhya Pradesh');
  });

  it('sender name follows the School Name until edited', () => {
    component.form.get('schoolName')!.setValue('Sunrise School');
    expect(component.form.get('senderName')!.value).toBe('Sunrise School');
    component.form.get('senderName')!.markAsDirty();
    component.form.get('schoolName')!.setValue('Other');
    expect(component.form.get('senderName')!.value).toBe('Sunrise School');
  });

  it('every rule keeps Save disabled', () => {
    component.form.setValue({ ...VALID, senderName: VALID.schoolName });
    component.form.markAsDirty();
    expect(component.canSave).toBeTrue();
    const bad: Record<string, string> = { foundedYear: '1899', pinCode: '4520', phoneOne: '98765', phoneSecond: '12', email: 'x@', udiseNumber: '123', schoolName: ' ' };
    Object.entries(bad).forEach(([key, value]) => {
      component.form.setValue({ ...VALID, senderName: VALID.schoolName, [key]: value });
      expect(component.canSave).withContext(key).toBeFalse();
    });
  });

  it('save: one request (double-submit guarded), toast, meta, empty note gone', () => {
    component.form.setValue({ ...VALID, senderName: VALID.schoolName });
    component.form.markAsDirty();
    api.save.and.returnValue(of({ message: 'School profile saved', profile: SAVED }));
    component.isClick = true;
    component.saveProfile();
    expect(api.save).not.toHaveBeenCalled();
    component.isClick = false;
    component.saveProfile();
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(component.toastVisible).toBeTrue();
    expect(component.profile).toEqual(SAVED);
    expect(component.metaLine).toBe('Last saved just now by School Owner');
    expect(component.canSave).toBeFalse();
  });

  it('server field errors are shown under the field', () => {
    component.form.setValue({ ...VALID, senderName: VALID.schoolName });
    component.form.markAsDirty();
    api.save.and.returnValue(throwError(() => ({ category: 'ValidationError', message: 'Please fix the highlighted fields', fields: [{ field: 'state', message: 'Pick a state from the list.' }] })));
    component.saveProfile();
    expect(component.showError('state')).toBe('Pick a state from the list.');
    expect(component.isClick).toBeFalse();
  });

  it('logo over 100 KB or not PNG/JPG is refused before upload', () => {
    const pick = (file: File) => component.onLogoPicked({ target: { files: [file], value: '' } } as unknown as Event);
    pick(new File([new Uint8Array(101 * 1024)], 'big.png', { type: 'image/png' }));
    expect(component.logoError).toBe('Logo must be 100 KB or smaller.');
    pick(new File([new Uint8Array(10)], 'x.gif', { type: 'image/gif' }));
    expect(component.logoError).toBe('Only JPG/PNG images are allowed.');
    expect(component.logoFile).toBeNull();
  });

  it('load error shows Retry state', () => {
    api.get.and.returnValue(throwError(() => new Error('down')));
    component.fetch();
    expect(component.loadError).toBe("Couldn't load the school profile.");
    expect(component.loading).toBeFalse();
  });
});

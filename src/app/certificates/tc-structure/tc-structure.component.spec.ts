import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { TcStructureService } from 'src/app/shared/services/certificates/tc-structure.service';
import { TcStructureView } from 'src/app/shared/models/certificates/certificates.model';
import { TcStructureComponent } from './tc-structure.component';

const view = (canEdit: boolean): TcStructureView => ({
  fields: Array.from({ length: 19 }, (_, i) => ({ no: i + 1, label: `Field ${i + 1}` })),
  nextSerialNumber: 'TC-2026-0048',
  issuedThisSession: 7,
  canEdit
});

describe('TcStructureComponent', () => {
  let fixture: ComponentFixture<TcStructureComponent>;

  const setup = async (canEdit: boolean) => {
    await TestBed.configureTestingModule({
      declarations: [TcStructureComponent],
      providers: [
        { provide: TcStructureService, useValue: { get: () => of(view(canEdit)), save: () => of(view(canEdit)) } },
        { provide: ShellContextService, useValue: { context: of({ activeSession: '2026-2027' }) } },
        { provide: AdminAuthService, useValue: { getLoggedInAdminInfo: () => ({ id: 'a1' }) } },
        { provide: MatSnackBar, useValue: { open: () => undefined } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(TcStructureComponent);
    fixture.detectChanges();
  };

  it('renders the 19 fields as locked, checked, disabled checkboxes', async () => {
    await setup(true);
    const boxes = Array.from(fixture.nativeElement.querySelectorAll('.field-check.locked input')) as HTMLInputElement[];
    expect(boxes.length).toBe(19);
    expect(boxes.every((box) => box.checked && box.disabled)).toBeTrue();
    expect(fixture.nativeElement.querySelectorAll('.field-check .bi-lock-fill').length).toBe(19);
    expect(fixture.nativeElement.querySelector('.btn-primary')).not.toBeNull();
  });

  it('without the tc-structure grant the serial is read-only and Save is hidden', async () => {
    await setup(false);
    expect((fixture.nativeElement.querySelector('#tcSerial') as HTMLInputElement).disabled).toBeTrue();
    expect(fixture.nativeElement.querySelector('.btn-primary')).toBeNull();
  });
});

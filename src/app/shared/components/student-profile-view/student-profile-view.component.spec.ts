import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChangeDetectorRef, SimpleChange } from '@angular/core';
import { of, throwError } from 'rxjs';
import { StudentDetail } from 'src/app/shared/models/student/student.model';
import { ManageStudentsService } from 'src/app/shared/services/student/manage-students.service';
import { StudentProfileViewComponent } from './student-profile-view.component';

const DETAIL = {
  student: {
    _id: 's1', name: 'Rohan Kapoor', admissionNo: 101, status: 'admitted', photoUrl: null, card: '88218821', verifyMode: 4,
    aadharNumber: 'XXXX-XXXX-2346', penNumber: 'XXXXXXX8901', bankAccountNo: null, bankIfscCode: 'XXXXXXX1234',
    admissionClass: 'c8', admissionClassLabel: '8th', feesConcession: 999
  },
  placement: null,
  feeRecord: { totalFee: 40000, concession: 5000, admissionFee: 2000, payable: 35000, concessionReason: null }
} as unknown as StudentDetail;

describe('StudentProfileViewComponent', () => {
  let fixture: ComponentFixture<StudentProfileViewComponent>;
  let view: StudentProfileViewComponent;
  let api: jasmine.SpyObj<ManageStudentsService>;

  // A direct property set doesn't dirty an OnPush view the way an input binding does.
  const setDetail = (detail: StudentDetail | null): void => {
    view.detail = detail;
    view.ngOnChanges({ detail: new SimpleChange(null, detail, false) });
    fixture.componentRef.injector.get(ChangeDetectorRef).markForCheck();
    fixture.detectChanges();
  };
  const item = (label: string): HTMLElement => (Array.from(fixture.nativeElement.querySelectorAll('.view-item')) as HTMLElement[])
    .find((el) => el.querySelector('label')!.textContent!.trim() === label)!;
  const valueOf = (label: string): string => item(label).querySelector('.view-value span')!.textContent!.trim();
  const eye = (label: string): HTMLButtonElement => item(label).querySelector('.reveal-btn') as HTMLButtonElement;

  beforeEach(async () => {
    api = jasmine.createSpyObj<ManageStudentsService>('ManageStudentsService', ['revealField']);
    api.revealField.and.returnValue(of({ field: 'aadharNumber', value: '234123412346' }));
    await TestBed.configureTestingModule({
      declarations: [StudentProfileViewComponent],
      providers: [{ provide: ManageStudentsService, useValue: api }]
    }).compileComponents();
    fixture = TestBed.createComponent(StudentProfileViewComponent);
    view = fixture.componentInstance;
    view.adminId = 'a1';
    setDetail(DETAIL);
  });

  it('shows Aadhar / PEN / bank A/C / IFSC masked, each with its own eye toggle', () => {
    expect(valueOf('Aadhar Number')).toBe('XXXX-XXXX-2346');
    expect(valueOf('PEN')).toBe('XXXXXXX8901');
    expect(eye('Aadhar Number')).not.toBeNull();
    expect(eye('Bank IFSC Code')).not.toBeNull();
    // Nothing to reveal for an empty field.
    expect(eye('Bank A/C Number')).toBeNull();
  });

  it('reveals ONE field through the logged server call; hiding it again is local', () => {
    eye('Aadhar Number').click();
    fixture.detectChanges();
    expect(api.revealField).toHaveBeenCalledOnceWith('a1', 's1', 'aadharNumber');
    expect(valueOf('Aadhar Number')).toBe('234123412346');
    expect(valueOf('PEN')).toBe('XXXXXXX8901');
    expect(eye('Aadhar Number').getAttribute('aria-pressed')).toBe('true');

    eye('Aadhar Number').click();
    fixture.detectChanges();
    expect(valueOf('Aadhar Number')).toBe('XXXX-XXXX-2346');
    expect(api.revealField).toHaveBeenCalledTimes(1);
  });

  it('resets every field to masked when the modal closes or shows another student', () => {
    eye('Aadhar Number').click();
    fixture.detectChanges();
    setDetail(null);
    setDetail(DETAIL);
    expect(valueOf('Aadhar Number')).toBe('XXXX-XXXX-2346');
  });

  it('says so when a reveal fails, and stays masked', () => {
    api.revealField.and.returnValue(throwError(() => new Error('500')));
    eye('PEN').click();
    fixture.detectChanges();
    expect(valueOf('PEN')).toBe('XXXXXXX8901');
    expect(item('PEN').querySelector('.reveal-error')?.textContent).toContain("Couldn't reveal");
  });

  it("shows First Enrolled Class's label and the fee record's concession (Fees-module truth)", () => {
    expect(valueOf('First Enrolled Class')).toBe('8th');
    expect(valueOf('Fees Concession')).toBe('₹ 5,000');
  });
});

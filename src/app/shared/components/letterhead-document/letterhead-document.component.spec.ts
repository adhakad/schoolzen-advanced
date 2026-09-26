import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LetterheadDocument } from 'src/app/shared/models/letterhead.model';
import { LetterheadDocumentComponent } from './letterhead-document.component';

const DOCUMENT: LetterheadDocument = {
  header: { schoolName: 'GREEN VALLEY PUBLIC SCHOOL', logoUrl: null, metaLines: ['Recognized by CBSE', 'Indore'] },
  title: 'CERTIFICATE OF ADMISSION',
  subtitle: 'Academic Session 2026-27',
  sectionLabel: 'Admission Details',
  fields: [{ label: 'Admission No.', value: '2024142' }, { label: 'Class', value: '8th · A' }],
  note: 'This is to certify…',
  generatedAt: '2026-09-26T00:00:00.000Z'
};

describe('LetterheadDocumentComponent', () => {
  let fixture: ComponentFixture<LetterheadDocumentComponent>;
  let component: LetterheadDocumentComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ declarations: [LetterheadDocumentComponent] }).compileComponents();
    fixture = TestBed.createComponent(LetterheadDocumentComponent);
    component = fixture.componentInstance;
  });

  it('renders the shared letterhead frame, marked as the only print target', () => {
    component.document = DOCUMENT;
    fixture.detectChanges();
    const frame: HTMLElement = fixture.nativeElement.querySelector('.letter-frame');
    expect(frame).toBeTruthy();
    expect(frame.classList).toContain('print-target');
    expect(frame.querySelector('.letter-school-name')?.textContent).toContain('GREEN VALLEY PUBLIC SCHOOL');
    expect(frame.querySelector('.letter-title-band .t1')?.textContent).toContain('CERTIFICATE OF ADMISSION');
    expect(frame.querySelectorAll('.letter-grid > div').length).toBe(2);
  });

  it('renders nothing without a document', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.letter-frame')).toBeNull();
  });

  it('prints through the browser dialog', () => {
    const print = spyOn(window, 'print');
    component.print();
    expect(print).toHaveBeenCalled();
  });
});

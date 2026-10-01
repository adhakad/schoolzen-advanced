import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, Subject, throwError } from 'rxjs';
import { AdminAuthService } from 'src/app/services/auth/admin-auth.service';
import { ShellContextService } from 'src/app/shared/services/shell-context.service';
import { ManageStudentsService } from 'src/app/shared/services/student/manage-students.service';
import { StudentOptionsService } from 'src/app/shared/services/student/student-options.service';
import { JobStatusService } from 'src/app/shared/services/jobs/job-status.service';
import { StudentFilterOptions, StudentListRow } from 'src/app/shared/models/student/student.model';
import { ManageStudentsComponent } from './manage-students.component';
import { TextCasePipe } from 'src/app/shared/pipes/text-case.pipe';
import { ColumnCaseMenuComponent } from 'src/app/shared/components/column-case-menu/column-case-menu.component';

const OPTIONS: StudentFilterOptions = {
  classes: [
    { _id: 'c8', class: 8, label: '8th', hasStreams: false, sections: [{ _id: 's8a', name: 'A' }], streams: [] },
    { _id: 'c11', class: 11, label: '11th', hasStreams: true, sections: [], streams: [{ _id: 'sci', name: 'science', sections: [] }] }
  ],
  groups: []
};

const ROW: StudentListRow = {
  enrollmentId: 'e1', studentId: 'st1', name: 'Rohan Kapoor', admissionNo: 2024142, status: 'admitted',
  photoUrl: null, fatherName: 'Suresh', motherName: 'Sunita', contact: '9876543210', card: '88218821',
  rollNumber: 12, session: '2026-2027', classId: 'c8', streamId: null, groupId: null, sectionId: 's8a',
  className: '8th', streamName: null, sectionName: 'A', classTag: '8th · A', placementIncomplete: false
};

describe('ManageStudentsComponent', () => {
  let fixture: ComponentFixture<ManageStudentsComponent>;
  let component: ManageStudentsComponent;
  let api: jasmine.SpyObj<ManageStudentsService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<ManageStudentsService>('ManageStudentsService', [
      'getStudents', 'getOverview', 'getStudent', 'bulkDelete', 'assignCards', 'resyncCard', 'exportExcel', 'importExcel',
      'updateStudent'
    ]);
    api.getStudents.and.returnValue(of({ rows: [ROW], nextCursor: null, total: 1 }));
    api.getOverview.and.returnValue(of({ totalStudents: 1, cardsAssigned: 1 }));
    api.bulkDelete.and.returnValue(of({ message: 'ok', deleted: 1, rows: [] }));

    await TestBed.configureTestingModule({
      declarations: [ManageStudentsComponent, TextCasePipe, ColumnCaseMenuComponent],
      providers: [
        { provide: ManageStudentsService, useValue: api },
        { provide: StudentOptionsService, useValue: { getFilterOptions: () => of(OPTIONS), getFieldConfig: () => of({ fields: [], options: {} }) } },
        { provide: JobStatusService, useValue: { watch: () => of() } },
        { provide: AdminAuthService, useValue: { getLoggedInAdminInfo: () => ({ id: 'a1' }) } },
        { provide: ShellContextService, useValue: { context: of({ activeSession: '2026-2027' }) } },
        { provide: MatSnackBar, useValue: { open: () => undefined } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(ManageStudentsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('shows every student by default — no filter gates the list', () => {
    expect(api.getStudents).toHaveBeenCalledWith('a1', jasmine.objectContaining({
      session: '2026-2027', classId: '', streamId: '', groupId: '', sectionId: '', cursor: null
    }));
    expect(component.rows.length).toBe(1);
  });

  it('keeps the Excel button disabled until a Class is picked', () => {
    const button = (): HTMLButtonElement => fixture.nativeElement.querySelector('.excel-btn');
    expect(component.excelEnabled).toBe(false);
    expect(button().disabled).toBe(true);

    component.onFilterChange({ classId: 'c8', streamId: '', groupId: '', sectionId: '' });
    fixture.detectChanges();
    expect(component.excelEnabled).toBe(true);
    expect(button().disabled).toBe(false);
  });

  it('also needs the Stream before Excel opens for a streamed class', () => {
    component.onFilterChange({ classId: 'c11', streamId: '', groupId: '', sectionId: '' });
    expect(component.excelEnabled).toBe(false);
    component.onFilterChange({ classId: 'c11', streamId: 'sci', groupId: '', sectionId: '' });
    expect(component.excelEnabled).toBe(true);
  });

  it('narrows the list with the cascade filter and restarts at the first keyset page', () => {
    api.getStudents.calls.reset();
    component.onFilterChange({ classId: 'c8', streamId: '', groupId: '', sectionId: 's8a' });
    expect(component.page).toBe(1);
    expect(api.getStudents).toHaveBeenCalledWith('a1', jasmine.objectContaining({ classId: 'c8', sectionId: 's8a', cursor: null }));
  });

  it('never deletes on a click — it opens the type-DELETE confirmation first', () => {
    component.onDelete(ROW);
    expect(api.bulkDelete).not.toHaveBeenCalled();
    expect(component.confirmOpen).toBe(true);
    expect(component.confirmConfig.typeToConfirm).toBe('DELETE');

    component.onConfirmed();
    // No Idempotency-Key on a delete (student/optimization.md) — repeating it is harmless.
    expect(api.bulkDelete).toHaveBeenCalledWith('a1', ['st1']);
  });

  describe('header sort + display case (student-fix4.md H, frontend only)', () => {
    const ROWS: StudentListRow[] = [
      { ...ROW, enrollmentId: 'e1', studentId: 'st1', name: 'ROHAN KAPOOR', admissionNo: 300, rollNumber: 7, fatherName: 'suresh kapoor', motherName: 'SUNITA KAPOOR' },
      { ...ROW, enrollmentId: 'e2', studentId: 'st2', name: 'ananya sharma', admissionNo: null, rollNumber: 2, fatherName: 'Vikas Sharma', motherName: 'neha sharma' },
      { ...ROW, enrollmentId: 'e3', studentId: 'st3', name: 'Kabir Mehta', admissionNo: 100, rollNumber: null, fatherName: null, motherName: null }
    ];
    // Columns: 0 check, 1 photo, 2 adm no, 3 Student, 4 class, 5 Father, 6 Mother, 7 Roll
    const STUDENT = 3;
    const FATHER = 5;
    const MOTHER = 6;
    const cells = (col: number): string[] => (Array.from(fixture.nativeElement.querySelectorAll('tbody tr')) as HTMLElement[])
      .map((tr) => (tr.children[col] as HTMLElement).textContent!.trim());
    const headers = (): HTMLElement[] => Array.from(fixture.nativeElement.querySelectorAll('thead th')) as HTMLElement[];
    const clickSort = (label: string): void => {
      const button = headers().map((th) => th.querySelector('.th-sort') as HTMLButtonElement).find((b) => b && b.textContent!.trim() === label)!;
      button.click();
      fixture.detectChanges();
    };

    beforeEach(() => {
      api.getStudents.and.returnValue(of({ rows: ROWS, nextCursor: null, total: 3 }));
      component.onFilterChange({ classId: '', streamId: '', groupId: '', sectionId: '' });
      fixture.detectChanges();
      api.getStudents.calls.reset();
    });

    it('sort arrows on Admission No., Student and Roll No. only; "Aa" on Student only', () => {
      const sortable = headers().filter((th) => th.querySelector('.th-sort')).map((th) => th.querySelector('.th-sort')!.textContent!.trim());
      expect(sortable).toEqual(['Admission No.', 'Student', 'Roll No.']);
      const withCase = headers().filter((th) => th.querySelector('app-column-case-menu')).map((th) => th.querySelector('.th-sort')!.textContent!.trim());
      expect(withCase).toEqual(['Student']);
      // Father and Mother: plain header text, no control of either kind.
      const plain = headers().filter((th) => ['Father', 'Mother'].includes(th.textContent!.trim()));
      expect(plain.length).toBe(2);
      expect(plain.every((th) => !th.querySelector('button, app-column-case-menu'))).toBe(true);
      expect(headers().length).toBe(11);
    });

    const openCaseMenu = (): void => {
      fixture.nativeElement.querySelector('app-column-case-menu .case-trigger').click();
      fixture.detectChanges();
    };
    const clickOption = (label: string): void => {
      (Array.from(fixture.nativeElement.querySelectorAll('.case-menu .dd-option')) as HTMLElement[])
        .find((option) => option.textContent!.trim().startsWith(label))!.click();
      fixture.detectChanges();
    };

    it('offers "Apply to all fields" again in the Student "Aa" menu', () => {
      openCaseMenu();
      expect(fixture.nativeElement.querySelector('.case-menu .apply-all')).not.toBeNull();
      expect(fixture.nativeElement.querySelectorAll('.case-menu .dd-option').length).toBe(4);
    });

    it('shows Student in Title Case on load; Father and Mother exactly as stored', () => {
      expect(cells(STUDENT)).toEqual(['Rohan Kapoor', 'Ananya Sharma', 'Kabir Mehta']);
      expect(cells(FATHER)).toEqual(['suresh kapoor', 'Vikas Sharma', '—']);
      expect(cells(MOTHER)).toEqual(['SUNITA KAPOOR', 'neha sharma', '—']);
    });

    it('a direct pick re-cases ONLY Student — no API call, the data untouched', () => {
      openCaseMenu();
      clickOption('UPPERCASE');
      expect(cells(STUDENT)).toEqual(['ROHAN KAPOOR', 'ANANYA SHARMA', 'KABIR MEHTA']);
      expect(cells(FATHER)).toEqual(['suresh kapoor', 'Vikas Sharma', '—']);
      expect(cells(MOTHER)).toEqual(['SUNITA KAPOOR', 'neha sharma', '—']);
      expect(component.rows[1].name).toBe('ananya sharma');
      expect(api.getStudents).not.toHaveBeenCalled();
    });

    it('"Apply to all fields" re-cases Student, Father and Mother together, then closes', () => {
      openCaseMenu();
      clickOption('lowercase');
      clickOption('Apply to all fields');
      expect(fixture.nativeElement.querySelector('.case-menu')).toBeNull();
      expect(cells(STUDENT)).toEqual(['rohan kapoor', 'ananya sharma', 'kabir mehta']);
      expect(cells(FATHER)).toEqual(['suresh kapoor', 'vikas sharma', '—']);
      expect(cells(MOTHER)).toEqual(['sunita kapoor', 'neha sharma', '—']);
      expect(component.rows[0].fatherName).toBe('suresh kapoor');
      expect(api.getStudents).not.toHaveBeenCalled();

      // A later direct pick moves Student alone; Father/Mother keep the applied case.
      openCaseMenu();
      clickOption('Title Case');
      expect(cells(STUDENT)).toEqual(['Rohan Kapoor', 'Ananya Sharma', 'Kabir Mehta']);
      expect(cells(MOTHER)).toEqual(['sunita kapoor', 'neha sharma', '—']);
    });

    it('Apply-to-all leaves the sort arrows working exactly as before', () => {
      openCaseMenu();
      clickOption('UPPERCASE');
      clickOption('Apply to all fields');
      clickSort('Student');
      expect(cells(STUDENT)).toEqual(['ANANYA SHARMA', 'KABIR MEHTA', 'ROHAN KAPOOR']);
      expect(cells(FATHER)).toEqual(['VIKAS SHARMA', '—', 'SURESH KAPOOR']);
      clickSort('Roll No.');
      expect(component.rows.map((row) => row.rollNumber)).toEqual([2, 7, null]);
    });

    it('sorts Student A→Z then Z→A, case-insensitively', () => {
      clickSort('Student');
      expect(cells(STUDENT)).toEqual(['Ananya Sharma', 'Kabir Mehta', 'Rohan Kapoor']);
      expect(headers()[STUDENT].getAttribute('aria-sort')).toBe('ascending');
      clickSort('Student');
      expect(cells(STUDENT)).toEqual(['Rohan Kapoor', 'Kabir Mehta', 'Ananya Sharma']);
    });

    it('sorts Admission No. and Roll No. numerically, blanks last both ways', () => {
      clickSort('Admission No.');
      expect(component.rows.map((row) => row.admissionNo)).toEqual([100, 300, null]);
      clickSort('Admission No.');
      expect(component.rows.map((row) => row.admissionNo)).toEqual([300, 100, null]);
      clickSort('Roll No.');
      expect(component.rows.map((row) => row.rollNumber)).toEqual([2, 7, null]);
      expect(api.getStudents).not.toHaveBeenCalled();
    });

    it('keeps the sort on the next page that arrives', () => {
      component.toggleSort('name');
      api.getStudents.and.returnValue(of({ rows: [...ROWS].reverse(), nextCursor: null, total: 3 }));
      component.onFilterChange({ classId: 'c8', streamId: '', groupId: '', sectionId: '' });
      expect(component.rows.map((row) => row.studentId)).toEqual(['st2', 'st3', 'st1']);
    });
  });

  describe('Excel modal (student-fix4.md B/C)', () => {
    beforeEach(() => {
      component.onFilterChange({ classId: 'c8', streamId: '', groupId: '', sectionId: '' });
      component.onOpenExcel();
      fixture.detectChanges();
    });

    it('exports Masked by default; Full only when chosen', () => {
      api.exportExcel.and.returnValue(of(new Blob()));
      spyOn(URL, 'createObjectURL').and.returnValue('blob:x');
      spyOn(URL, 'revokeObjectURL');
      spyOn(HTMLAnchorElement.prototype, 'click');
      component.onExport();
      expect(api.exportExcel).toHaveBeenCalledWith('a1', { session: '2026-2027', classId: 'c8', streamId: '', mode: 'masked' });
      component.exportMode = 'full';
      component.onExport();
      expect(api.exportExcel).toHaveBeenCalledWith('a1', jasmine.objectContaining({ mode: 'full' }));
    });

    it('re-opening resets the export choice to Masked', () => {
      component.exportMode = 'full';
      component.closeExcel();
      component.onOpenExcel();
      expect(component.exportMode).toBe('masked');
    });

    it('picking a file never uploads — Import does, and a different file can be picked first', () => {
      api.importExcel.and.returnValue(of({ message: 'ok', jobId: 'j1', warning: { code: 'COLUMNS_UNRECOGNIZED', message: "These columns weren't recognised and were ignored: Notes." } }));
      const pick = (name: string): void => component.onImportFileChosen({ target: { files: [new File(['x'], name)], value: '' } } as unknown as Event);
      pick('first.xlsx');
      pick('second.xlsx');
      expect(api.importExcel).not.toHaveBeenCalled();
      expect(component.importFile?.name).toBe('second.xlsx');
      component.onImportSubmit();
      expect(api.importExcel).toHaveBeenCalledTimes(1);
      expect((api.importExcel.calls.mostRecent().args[0] as FormData).get('file')).toEqual(jasmine.any(File));
      expect(component.importWarning).toContain('Notes');
    });

    it('rejects a non-.xlsx pick before anything is sent', () => {
      component.onImportFileChosen({ target: { files: [new File(['x'], 'data.csv')], value: '' } } as unknown as Event);
      expect(component.importFile).toBeNull();
      expect(component.importError).toBe('Choose an Excel (.xlsx) file.');
    });
  });

  describe('Card column — one header toggle for the whole column', () => {
    // Columns: … 9 Card
    const CARD = 9;
    const cards = (): string[] => (Array.from(fixture.nativeElement.querySelectorAll('tbody tr')) as HTMLElement[])
      .map((tr) => (tr.children[CARD] as HTMLElement).textContent!.trim());
    const toggle = (): HTMLButtonElement => fixture.nativeElement.querySelector('thead .card-mask-toggle');

    beforeEach(() => {
      api.getStudents.and.returnValue(of({ rows: [
        ROW,
        { ...ROW, enrollmentId: 'e2', studentId: 'st2', name: 'Priya Joshi', card: '55501234' },
        { ...ROW, enrollmentId: 'e3', studentId: 'st3', name: 'Kabir Mehta', card: null }
      ], nextCursor: null, total: 3 }));
      component.onFilterChange({ classId: '', streamId: '', groupId: '', sectionId: '' });
      fixture.detectChanges();
      api.getStudents.calls.reset();
    });

    it('masks every row by default, with no per-row control and no eye icon', () => {
      expect(cards()).toEqual(['•• 8821', '•• 1234', 'Not assigned']);
      expect(fixture.nativeElement.querySelector('tbody .card-eye, tbody .card-mask-toggle')).toBeNull();
      expect(toggle().getAttribute('aria-pressed')).toBe('false');
      expect(toggle().getAttribute('aria-label')).toBe('Show all card numbers in full');
      expect(toggle().querySelector('.bi-shield-lock')).not.toBeNull();
      expect(toggle().querySelector('.bi-eye, .bi-eye-slash')).toBeNull();
    });

    it('flips the WHOLE column full and back at once; "Not assigned" untouched; no API call', () => {
      toggle().click();
      fixture.detectChanges();
      expect(cards()).toEqual(['88218821', '55501234', 'Not assigned']);
      expect(toggle().getAttribute('aria-pressed')).toBe('true');
      expect(toggle().getAttribute('aria-label')).toBe('Mask all card numbers');
      expect(toggle().querySelector('.bi-shield-slash')).not.toBeNull();

      toggle().click();
      fixture.detectChanges();
      expect(cards()).toEqual(['•• 8821', '•• 1234', 'Not assigned']);
      expect(api.getStudents).not.toHaveBeenCalled();
      expect(api.updateStudent).not.toHaveBeenCalled();
    });
  });

  describe('photo upload from the row avatar', () => {
    let snack: jasmine.Spy;
    const avatar = (): HTMLButtonElement => fixture.nativeElement.querySelector('tbody .avatar-btn');
    const input = (): HTMLInputElement => fixture.nativeElement.querySelector('input.row-photo-input');
    /** Puts `file` in the hidden input and fires its change, as a real pick does. */
    const pick = (file: File): void => {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input().files = transfer.files;
      input().dispatchEvent(new Event('change'));
      fixture.detectChanges();
    };

    beforeEach(() => {
      snack = spyOn(TestBed.inject(MatSnackBar), 'open');
      fixture.detectChanges();
    });

    it('is a real button named for the student, and opens the JPG/PNG picker', () => {
      const opened = spyOn(input(), 'click');
      expect(avatar().tagName).toBe('BUTTON');
      expect(avatar().getAttribute('aria-label')).toBe('Change photo for Rohan Kapoor');
      expect(input().accept).toBe('image/png,image/jpeg');
      avatar().click();
      expect(opened).toHaveBeenCalled();
    });

    it('uploads straight away as multipart `photo`, busy on that row, then writes the row back', () => {
      spyOn(input(), 'click');
      const pending = new Subject<{ message: string; student: StudentListRow; warnings: never[] }>();
      api.updateStudent.and.returnValue(pending.asObservable());
      api.getStudents.calls.reset();

      avatar().click();
      pick(new File(['x'], 'rohan.png', { type: 'image/png' }));

      expect(api.updateStudent).toHaveBeenCalledTimes(1);
      const [id, body] = api.updateStudent.calls.mostRecent().args;
      expect(id).toBe('st1');
      expect(body.get('photo')).toEqual(jasmine.any(File));
      expect((body.get('photo') as File).name).toBe('rohan.png');
      expect(body.get('adminId')).toBe('a1');
      expect(body.get('session')).toBe('2026-2027');

      // Busy: the avatar and this row's actions wait; a spinner shows over the avatar.
      expect(avatar().disabled).toBe(true);
      expect(avatar().getAttribute('aria-busy')).toBe('true');
      expect(avatar().querySelector('.bi-arrow-repeat.spinning')).not.toBeNull();
      expect(component.isBusy(ROW)).toBe(true);

      pending.next({ message: 'Student updated', student: { ...ROW, photoUrl: 'https://cdn.test/rohan.png' }, warnings: [] });
      fixture.detectChanges();
      expect(component.isBusy(ROW)).toBe(false);
      expect(avatar().disabled).toBe(false);
      expect(fixture.nativeElement.querySelector('tbody .st-avatar img').getAttribute('src')).toBe('https://cdn.test/rohan.png');
      expect(snack).toHaveBeenCalledWith('Photo updated for Rohan Kapoor.', 'Close', jasmine.any(Object));
      expect(api.getStudents).not.toHaveBeenCalled();
    });

    it("shows the server's warning when the save went through but the image didn't", () => {
      spyOn(input(), 'click');
      api.updateStudent.and.returnValue(of({
        message: 'Student updated', student: ROW,
        warnings: [{ code: 'IMAGE_UPLOAD_FAILED', message: "The photo couldn't be uploaded." }]
      }));
      avatar().click();
      pick(new File(['x'], 'rohan.jpg', { type: 'image/jpeg' }));
      expect(snack.calls.mostRecent().args[0]).toContain("The photo couldn't be uploaded.");
    });

    it("shows the server's photo error and clears the busy state", () => {
      spyOn(input(), 'click');
      api.updateStudent.and.returnValue(throwError(() => ({
        category: 'ValidationError', message: 'Please correct the highlighted fields.',
        fields: [{ field: 'photo', message: 'Only JPG/PNG images are allowed.' }]
      })));
      avatar().click();
      pick(new File(['x'], 'rohan.png', { type: 'image/png' }));
      expect(component.isBusy(ROW)).toBe(false);
      expect(snack).toHaveBeenCalledWith('Only JPG/PNG images are allowed.', 'Close', jasmine.any(Object));
    });

    it('rejects a non-JPG/PNG or over-2MB file before anything is sent', () => {
      spyOn(input(), 'click');
      avatar().click();
      pick(new File(['x'], 'notes.pdf', { type: 'application/pdf' }));
      expect(snack).toHaveBeenCalledWith('Only JPG/PNG images are allowed.', 'Close', jasmine.any(Object));

      avatar().click();
      pick(new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'big.jpg', { type: 'image/jpeg' }));
      expect(snack).toHaveBeenCalledWith('Image must be under 2MB.', 'Close', jasmine.any(Object));
      expect(api.updateStudent).not.toHaveBeenCalled();
      expect(component.isBusy(ROW)).toBe(false);
    });

    it('leaves the row actions (View, Assign, Resync, Edit, Delete) in place', () => {
      const labels = (Array.from(fixture.nativeElement.querySelectorAll('tbody .actions .icon-btn')) as HTMLElement[])
        .map((button) => button.getAttribute('aria-label'));
      expect(labels).toEqual(['View Rohan Kapoor', 'Assign card to Rohan Kapoor', 'Resync Rohan Kapoor', 'Edit Rohan Kapoor', 'Delete Rohan Kapoor']);
    });
  });

  it('asks the server only for the columns the table renders', () => {
    expect(api.getStudents).toHaveBeenCalledWith('a1', jasmine.objectContaining({
      fields: 'name,admissionNo,status,photo,father,mother,contact,card'
    }));
  });

  it('drops a stale list response when a newer filter fires (switchMap)', () => {
    const slow = new Subject<{ rows: StudentListRow[]; nextCursor: null; total: number }>();
    api.getStudents.and.returnValues(slow.asObservable(), of({ rows: [{ ...ROW, studentId: 'st2', name: 'Newer' }], nextCursor: null, total: 1 }));
    component.onFilterChange({ classId: 'c8', streamId: '', groupId: '', sectionId: '' });
    component.onFilterChange({ classId: 'c8', streamId: '', groupId: '', sectionId: 's8a' });
    slow.next({ rows: [ROW], nextCursor: null, total: 1 });
    expect(component.rows.map((row) => row.name)).toEqual(['Newer']);
  });

  it('removes deleted rows from the response — no refetch of the list', () => {
    api.getStudents.calls.reset();
    component.onDelete(ROW);
    component.onConfirmed();
    expect(component.rows.length).toBe(0);
    expect(component.overview).toEqual({ totalStudents: 0, cardsAssigned: 0 });
    expect(api.getStudents).not.toHaveBeenCalled();
  });

  it('writes a saved student back into the table — prepended on create, replaced on edit', () => {
    const page = component as unknown as { onFormSubmit(): void; studentForm: { buildPayload(): FormData } };
    page.studentForm = { buildPayload: () => new FormData() };
    api.getStudents.calls.reset();

    api.createStudent = jasmine.createSpy().and.returnValue(of({ message: 'ok', student: { ...ROW, studentId: 'st2', name: 'New Kid' } }));
    component.onCreate();
    page.onFormSubmit();
    expect(component.rows.map((row) => row.name)).toEqual(['New Kid', 'Rohan Kapoor']);
    expect(component.overview.totalStudents).toBe(2);

    api.getStudent.and.returnValue(of({ student: {} as never, placement: null }));
    api.updateStudent = jasmine.createSpy().and.returnValue(of({ message: 'ok', student: { ...ROW, name: 'Rohan K.' } }));
    component.onEdit(ROW);
    page.onFormSubmit();
    expect(component.rows.map((row) => row.name)).toEqual(['New Kid', 'Rohan K.']);
    expect(api.getStudents).not.toHaveBeenCalled();
  });

  it('patches assigned cards into the rows straight from the 202 response', () => {
    api.getStudents.and.returnValue(of({ rows: [{ ...ROW, card: null }], nextCursor: null, total: 1 }));
    component.onFilterChange({ classId: '', streamId: '', groupId: '', sectionId: '' });
    api.getStudents.calls.reset();
    api.assignCards.and.returnValue(of({ message: 'ok', jobId: 'j1', assigned: 1, cards: [{ studentId: 'st1', card: '0001234' }], rows: [] }));
    component.onAssignCard(ROW);
    component.onCardInput('st1', '0001234');
    component.onCardSubmit();
    // In full — an operational identifier, never masked.
    expect(component.rows[0].card).toBe('0001234');
    expect(component.overview.cardsAssigned).toBe(2);
    expect(api.getStudents).not.toHaveBeenCalled();
  });

  it('confirms before a resync reaches the devices', () => {
    api.resyncCard.and.returnValue(of({ message: 'ok', jobId: 'j1' }));
    component.onResync(ROW);
    expect(api.resyncCard).not.toHaveBeenCalled();
    component.onConfirmed();
    expect(api.resyncCard).toHaveBeenCalledWith('a1', 'st1');
  });

  it('keys the per-row busy state by row — one row resyncing never blocks another', () => {
    const pending = new Subject<{ message: string; jobId: string }>();
    api.resyncCard.and.returnValue(pending.asObservable());
    component.onResync(ROW);
    component.onConfirmed();
    expect(component.isBusy(ROW)).toBe(true);
    expect(component.isBusy({ ...ROW, studentId: 'st2' })).toBe(false);
    pending.next({ message: 'ok', jobId: 'j1' });
    expect(component.isBusy(ROW)).toBe(false);
  });

  it('shows a per-row outcome when part of a bulk delete fails, not one toast', () => {
    api.bulkDelete.and.returnValue(of({
      message: '1 student processed', deleted: 1,
      rows: [{ id: 'st9', code: 'STUDENT_NOT_FOUND', message: 'Student not found' }]
    }));
    component.selected.set('st1', ROW);
    component.selected.set('st9', { ...ROW, studentId: 'st9', name: 'Gone Student' });
    component.onDeleteSelected();
    component.onConfirmed();
    expect(component.bulkResultOpen).toBe(true);
    expect(component.bulkResultLines).toEqual([{ key: 'st9', label: 'Gone Student', message: 'Student not found' }]);
  });

  it('ignores a second delete while one is in flight (double-submit guard)', () => {
    const pending = new Subject<never>();
    api.bulkDelete.and.returnValue(pending.asObservable());
    component.onDelete(ROW);
    component.onConfirmed();
    component.onDelete({ ...ROW, studentId: 'st2' });
    component.onConfirmed();
    expect(api.bulkDelete).toHaveBeenCalledTimes(1);
  });

  it('rejects the same card typed for two students before submit', () => {
    const second = { ...ROW, studentId: 'st2', name: 'Priya Joshi' };
    component.selected.set('st1', ROW);
    component.selected.set('st2', second);
    component.onAssignCardSelected();
    component.onCardInput('st1', '1234');
    component.onCardInput('st2', '1234');
    expect(component.cardRowError('st2')).toContain('Rohan Kapoor');
    expect(component.cardSubmitDisabled).toBe(true);
    component.onCardSubmit();
    expect(api.assignCards).not.toHaveBeenCalled();
  });

  it('tells a failed list load apart from an empty one', () => {
    api.getStudents.and.returnValue(throwError(() => new Error('down')));
    component.retryList();
    fixture.detectChanges();
    expect(component.loadError).toContain("Couldn't load");
    expect(fixture.nativeElement.querySelector('.load-error')).toBeTruthy();
    expect(fixture.nativeElement.textContent).not.toContain('No students in this session yet');
  });
});

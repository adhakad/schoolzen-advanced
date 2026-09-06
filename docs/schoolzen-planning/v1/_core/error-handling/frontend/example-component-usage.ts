/**
 * EXAMPLE — not a real component, shows how any module's form
 * component consumes a ValidationError's fields[] to show inline
 * errors, per ../README.md's "Frontend handling" section: this is
 * the ONE category the interceptor deliberately doesn't toast, so the
 * component is expected to handle it like this.
 */
import { Component } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { ApiError } from './api-error.model';

@Component({ selector: 'app-example-student-form', template: '' })
export class ExampleStudentFormComponent {
  form: FormGroup;

  constructor(private fb: FormBuilder, private studentService: any) {
    this.form = this.fb.group({ name: [''], aadharNumber: [''] });
  }

  submit() {
    this.studentService.create(this.form.value).subscribe({
      next: (student: any) => { /* success path */ },
      error: (apiError: ApiError) => {
        if (apiError.category === 'ValidationError' && apiError.fields) {
          // Map each field error onto the matching FormControl, so it
          // renders through the SAME <mat-error> pattern already used
          // everywhere else in the app - no separate error-toast UI
          // for validation, ever.
          apiError.fields.forEach(({ field, message }) => {
            this.form.get(field)?.setErrors({ server: message });
          });
        }
        // Every other category is already toasted by the interceptor -
        // this component does nothing further for those.
      }
    });
  }
}

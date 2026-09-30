import { Pipe, PipeTransform } from '@angular/core';
import { applyTextCase, TextCase } from 'src/app/shared/utils/text-case.util';

/**
 * `{{ row.name | textCase: columnCase.name }}` — pure, so a cell is only re-cased when its
 * value or its column's case actually changes, never on every change-detection pass.
 * A missing value renders as `fallback` (the table's "—").
 */
@Pipe({ name: 'textCase' })
export class TextCasePipe implements PipeTransform {
  transform(value: string | null | undefined, mode: TextCase, fallback = ''): string {
    return value ? applyTextCase(value, mode) : fallback;
  }
}

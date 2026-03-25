import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'formatMarksType'
})
export class FormatMarksTypePipe implements PipeTransform {

  transform(value: string): string {
    if (!value) {
      return '';
    }

    let formattedValue = value.replace(/([A-Z])/g, ' $1').trim();

    formattedValue = formattedValue.replace('Max', 'Maximum');
    formattedValue = formattedValue.replace('Pass', 'Passing');

    return formattedValue;
  }
}
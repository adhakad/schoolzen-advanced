import { Pipe, PipeTransform } from '@angular/core';
import * as numberToWords from 'number-to-words';

@Pipe({
  name: 'dateToWords'
})
export class DateToWordsPipe implements PipeTransform {

  transform(inputDate: string): string {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const dateParts = inputDate.split('/');
    const day = +dateParts[0];
    const monthIndex = +dateParts[1] - 1;
    const year = +dateParts[2];

    const dayWords = numberToWords.toWords(day);
    const monthWords = months[monthIndex];
    const yearWords = numberToWords.toWords(year);

    return `${dayWords} ${monthWords} ${yearWords}`;
  }

}

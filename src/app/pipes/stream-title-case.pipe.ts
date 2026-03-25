import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'streamTitleCase'
})
export class StreamTitleCasePipe implements PipeTransform {

  transform(value: string): string {
    if (!value) return '';

    const lowerValue = value.toLowerCase();

    if (lowerValue === 'n/a') {
      return 'N/A';
    }

    return value
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

}

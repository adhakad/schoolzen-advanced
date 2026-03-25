import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'titlecaseSeparator'
})
export class TitlecaseSeparatorPipe implements PipeTransform {

  transform(value: string): string {
    return value
      .replace(/([a-z])([A-Z])/g, '$1 $2') // CamelCase split
      .replace(/\b\w/g, char => char.toUpperCase()); // First letter uppercase
  }

}

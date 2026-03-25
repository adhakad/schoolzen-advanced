import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'secureMobile'
})
export class SecureMobilePipe implements PipeTransform {

  transform(value: string | number): string {
    // if (!value) {
    //   return '';
    // }

    const strValue = value.toString();

    if (strValue.length !== 10 || !/^\d{10}$/.test(strValue)) {
      return '';
    }

    const firstTwo = strValue.slice(0, 2);
    const lastThree = strValue.slice(-3);
    return `${firstTwo}*****${lastThree}`;
  }

}

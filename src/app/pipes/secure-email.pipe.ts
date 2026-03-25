import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'secureEmail'
})
export class SecureEmailPipe implements PipeTransform {
  transform(value: string): string {
    if (!value) {
      return '';
    }

    const [localPart, domain] = value.split('@');
    const maskedLocalPart = localPart.slice(0, 2) + '****';  // Starting ke 2 characters ke baad ****
    return `${maskedLocalPart}@${domain}`;
  }
}

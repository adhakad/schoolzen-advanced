import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'numberToWords'
})
export class NumberToWordsPipe implements PipeTransform {

  private words: string[] = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
private tens: string[] = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
private scales: string[] = ['', 'Thousand', 'Million', 'Billion'];

transform(value: number): string {
if (isNaN(value)) return '';
if (value === 0) return 'Zero';

return this.convertNumberToWords(value);
}

private convertNumberToWords(num: number): string {
if (num < 20) return this.words[num];
if (num < 100) return `${this.tens[Math.floor(num / 10)]} ${num % 10 ? this.words[num % 10] : ''}`.trim();

let word = '';
let scaleIndex = 0;

while (num > 0) {
const chunk = num % 1000;

if (chunk) {
const chunkWords = this.chunkToWords(chunk);
word = `${chunkWords} ${this.scales[scaleIndex]} ${word}`.trim();
}

num = Math.floor(num / 1000);
scaleIndex++;
}

return word.trim();
}

private chunkToWords(num: number): string {
let word = '';

if (num >= 100) {
word += `${this.words[Math.floor(num / 100)]} Hundred `;
num %= 100;
}

if (num >= 20) {
word += `${this.tens[Math.floor(num / 10)]} `;
num %= 10;
}

if (num > 0) {
word += `${this.words[num]} `;
}

return word.trim();
}
}


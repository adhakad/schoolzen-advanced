import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'classSuffix'
})
export class ClassSuffixPipe implements PipeTransform {

  transform(classNumber: number): any {
    if (classNumber >= 4 && classNumber <= 12) {
      return `${classNumber}th`;
    }
    if(classNumber==1){
      return `${classNumber}st`;
    }
    if(classNumber==2){
      return `${classNumber}nd`;
    }
    if(classNumber==3){
      return `${classNumber}rd`;
    }
    if(classNumber==200){
      return `Nursery`
    }
    if(classNumber==201){
      return `LKG`
    }
    if(classNumber==202){
      return `UKG`
    }
  }

}
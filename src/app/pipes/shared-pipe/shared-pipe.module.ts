import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChunkPipe } from '../chunk.pipe';
import { ClassSuffixPipe } from '../class-suffix.pipe';
import { DateToWordsPipe } from '../date-to-words.pipe';
import { SecureEmailPipe } from '../secure-email.pipe';
import { SecureMobilePipe } from '../secure-mobile.pipe';
import { NumberToWordsPipe } from '../number-to-words.pipe';
import { FormatMarksTypePipe } from '../format-marks-type.pipe';
import { TitlecaseSeparatorPipe } from '../titlecase-separator.pipe';
import { StreamTitleCasePipe } from '../stream-title-case.pipe';


@NgModule({
  declarations: [
    ChunkPipe,
    ClassSuffixPipe,
    DateToWordsPipe,
    SecureEmailPipe,
    SecureMobilePipe,
    NumberToWordsPipe,
    FormatMarksTypePipe,
    TitlecaseSeparatorPipe,
    StreamTitleCasePipe
  ],
  imports: [
    CommonModule
  ],
  exports: [
    ChunkPipe,
    ClassSuffixPipe,
    DateToWordsPipe,
    SecureEmailPipe,
    SecureMobilePipe,
    NumberToWordsPipe,
    FormatMarksTypePipe,
    TitlecaseSeparatorPipe,
    StreamTitleCasePipe
  ]
})
export class SharedPipeModule { }

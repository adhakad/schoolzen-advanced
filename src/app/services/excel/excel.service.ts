
import { Injectable } from '@angular/core';
import { Workbook } from 'exceljs';
import * as fs from 'file-saver';
@Injectable({
  providedIn: 'root'
})
export class ExcelService {

  constructor() { }
  exportExcel(excelData: { title: any; data: any; headers: any ,fileName:any}) {
    let currentURL = window.location.href;
    let baseURL = new URL(currentURL).origin;
    //Title, Header & Data
    const title = excelData.title;
    const header = excelData.headers;
    const data = excelData.data;
    const fileName = excelData.fileName
    let workbook = new Workbook();
    let worksheet = workbook.addWorksheet('Student Record');
    // Merge cells for the title
    worksheet.mergeCells(`A1:AB1`);
    worksheet.getRow(1).height = 70;
    let titleRow = worksheet.getCell('A1');
    function generatePaddingSpaces(paddingCount: number): string {
      return ' '.repeat(paddingCount);
    }
    const leftPaddingCount = 75;
    const leftPadding = generatePaddingSpaces(leftPaddingCount);
    titleRow.value = leftPadding + title;
    titleRow.font = {
      name: 'Calibri',
      size: 18,
      bold: true,
      color: { argb: 'FFFFFF' },
    };
    titleRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '8D6DFF' },
    };
    titleRow.alignment = { vertical: 'middle', };
    worksheet.views = [
      {
        state: 'frozen',
        xSplit: 0,
        ySplit: 1,
        topLeftCell: 'A2', // Set the top-left cell below the title
      },
    ];

    // let d = new Date();
    // let month = d.getMonth() + 1;
    // let date = d.getDate() + '-' + month + '-' + d.getFullYear();
    let headerRow = worksheet.addRow(header);
    headerRow.eachCell((cell, number) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'EBEBFF' },
        bgColor: { argb: '' },
      };
      cell.font = {
        bold: true,
        color: { argb: '3F3661' },
        size: 12,
      };

      // Vertically center-align the text in the cell
      cell.alignment = { vertical: 'middle',horizontal:'center' };

      if (number < header.length) {
        cell.border = {
          top: { style: 'thin', color: { argb: 'EBEBFF' } },
          right: { style: 'thin', color: { argb: 'CDCDCD' } },
        };
      }

    });

    // Set the row height for the header row
    headerRow.height = 30;

    // Adding Data with Conditional Formatting

    data.forEach((d: any) => {
      let row = worksheet.addRow(Object.values(d));

      // Set the row height for the student detail rows
      row.height = 25; // Set the height as per your requirement (in points)
      row.eachCell((cell) => {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
    });

    // Calculate the number of columns in the worksheet
    let studentFieldLength = Object.keys(data[0]).length;

    // Set the column width for all columns in the worksheet
    for (let i = 0; i < studentFieldLength; i++) {
      let index = i + 1;
      worksheet.getColumn(index).width = 25;
    }
    // worksheet.addRow([]);
    // let footerRow = worksheet.addRow([
    //   `Students Record Generated from ${baseURL} at ${date}`,
    // ]);
    // footerRow.getCell(1).fill = {
    //   type: 'pattern',
    //   pattern: 'solid',
    //   fgColor: { argb: 'EBEBFF' },
    // };
    // footerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    // worksheet.mergeCells(`A${footerRow.number}:N${footerRow.number}`);
    workbook.xlsx.writeBuffer().then((data) => {
      let blob = new Blob([data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      fs.saveAs(blob, fileName + '.xlsx');
    });
  }
}




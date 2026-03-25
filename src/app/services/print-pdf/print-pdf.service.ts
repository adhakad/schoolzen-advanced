import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Observable, from } from 'rxjs';


@Injectable({
  providedIn: 'root'
})
export class PrintPdfService {
  constructor() { }
  printElement(element: HTMLElement): void {
    html2canvas(element).then(canvas => {
      var imgWidth = 208;
      var imgHeight = (canvas.height * imgWidth) / canvas.width;
      const imgData = canvas.toDataURL('image/png');
      const doc = new jsPDF("p", "mm", "a4");
      var position = 0;
      doc.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      doc.autoPrint();
      window.open(doc.output('bloburl'), '_blank');
    });
  }


  printContent(content: string): void {
    const doc = new jsPDF("p", "mm", "a4");
    const printWindow = window.open(doc.output('bloburl'), '_blank');

    if (printWindow) {
      printWindow.document.write(content);
      printWindow.document.close();

      printWindow.onload = () => {
        const style = printWindow.document.createElement('style');
        style.innerHTML = `
                @media print {
                    * {
                        -webkit-print-color-adjust: exact !important; /* Chrome, Safari, Edge */
                        color-adjust: exact !important; /* Firefox */
                    }
                }
            `;
        printWindow.document.head.appendChild(style);

        printWindow.print();
        printWindow.close();
      };
    }
  }

  generatePDF(element: HTMLElement, params: string): void {
    html2canvas(element).then(canvas => {
      var imgWidth = 208;
      var imgHeight = (canvas.height * imgWidth) / canvas.width;
      const imgData = canvas.toDataURL('image/png');
      const doc = new jsPDF("p", "mm", "a4");
      var position = 0;
      doc.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      doc.save(params);
    });
  }

  downloadPdf(content: string): void {
    const pdf = new jsPDF();

    html2canvas(document.body, {
      useCORS: true,
      logging: true,
      scale: 2,
      windowHeight: document.body.scrollHeight + 1000, // Increase the window height
      windowWidth: document.body.scrollWidth + 1000 // Increase the window width
    }).then(canvas => {
      const imgData = canvas.toDataURL('image/png');

      // Set the image dimensions based on your requirements
      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);

      // Save or download the PDF
      pdf.save('download.pdf');
    });
  }
}

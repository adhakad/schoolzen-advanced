/**
 * Fees' report downloads — Excel / CSV / PDF from rows the server already computed (the
 * page never re-derives a balance). The libraries load lazily, only when someone downloads.
 */
export type ExportFormat = 'excel' | 'csv' | 'pdf';

export type ExportRow = Record<string, string | number>;

const triggerDownload = (blob: Blob, fileName: string): void => {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
};

/** A plain landscape table — header row, then one line per row, paging as needed. */
const writePdf = async (rows: ExportRow[], title: string, fileName: string): Promise<void> => {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape' });
  const headers = Object.keys(rows[0]);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const colWidth = (pageWidth - 28) / headers.length;
  const clip = (text: string): string => {
    const max = Math.max(4, Math.floor(colWidth / 1.7));
    return text.length > max ? text.slice(0, max - 1) + '…' : text;
  };
  doc.setFontSize(13);
  doc.text(title, 14, 14);
  let y = 24;
  const drawHeader = (): void => {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    headers.forEach((header, i) => doc.text(clip(header), 14 + i * colWidth, y));
    doc.setFont('helvetica', 'normal');
    y += 6;
  };
  drawHeader();
  rows.forEach((row) => {
    if (y > pageHeight - 12) {
      doc.addPage();
      y = 16;
      drawHeader();
    }
    headers.forEach((header, i) => doc.text(clip(String(row[header] ?? '')), 14 + i * colWidth, y));
    y += 5.5;
  });
  doc.save(fileName);
};

/**
 * @param sheets one or more named tables; CSV/PDF use the first (or concatenate for PDF)
 */
export const exportRows = async (sheets: { name: string; rows: ExportRow[] }[], baseFileName: string, format: ExportFormat): Promise<boolean> => {
  const usable = sheets.filter((sheet) => sheet.rows.length);
  if (!usable.length) return false;
  if (format === 'pdf') {
    const rows = usable.length === 1 ? usable[0].rows : usable.flatMap((sheet) => sheet.rows.map((row) => ({ Section: sheet.name, ...row })));
    await writePdf(rows as ExportRow[], baseFileName.replace(/[-_]/g, ' '), `${baseFileName}.pdf`);
    return true;
  }
  const XLSX = await import('xlsx');
  if (format === 'csv') {
    const csv = usable.map((sheet) => XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(sheet.rows))).join('\n\n');
    triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `${baseFileName}.csv`);
    return true;
  }
  const workbook = XLSX.utils.book_new();
  usable.forEach((sheet) => XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(sheet.rows), sheet.name.slice(0, 31)));
  XLSX.writeFile(workbook, `${baseFileName}.xlsx`);
  return true;
};

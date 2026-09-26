'use strict';
const ExcelJS = require('exceljs');

// Excel read/write for v2 modules — a capability, not a module feature. Student
// Import/Export is the first user; any later module that imports or exports a sheet uses
// these two functions rather than touching exceljs itself.
//
// Columns are described once by the caller — `{ key, header, width? }` — and used in both
// directions, so an exported sheet re-imports cleanly: the header row IS the import
// contract.

/**
 * @param {Array<{key: String, header: String, width?: Number}>} columns
 * @param {Array<Object>} rows  plain objects keyed by column.key
 * @param {String} [sheetName]
 * @returns {Promise<Buffer>} .xlsx bytes
 */
const buildWorkbook = async (columns, rows, sheetName = 'Sheet1') => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(sheetName);
    sheet.columns = columns.map((column) => ({
        key: column.key,
        header: column.header,
        width: column.width || Math.max(12, column.header.length + 4),
    }));
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    rows.forEach((row) => sheet.addRow(row));
    return workbook.xlsx.writeBuffer();
};

// A cell's plain value: exceljs hands back rich-text/hyperlink/formula objects for some
// cells, and Excel dates as Date. Everything else is stringified by the validator anyway.
const cellValue = (value) => {
    if (value == null) return '';
    if (value instanceof Date) return value;
    if (typeof value === 'object') {
        if (value.richText) return value.richText.map((part) => part.text).join('');
        if (value.text != null) return value.text;
        if (value.result != null) return value.result;
    }
    return value;
};

/**
 * Parse the first worksheet. Columns are matched by HEADER text (case/space-insensitive),
 * never by position, so a school that reorders or adds columns doesn't corrupt its import.
 *
 * @returns {Promise<{ rows: Array<{ rowNumber: Number, values: Object }>, missingHeaders: String[] }>}
 */
const parseWorkbook = async (buffer, columns) => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) return { rows: [], missingHeaders: columns.map((column) => column.header) };

    const normalize = (text) => String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const keyByHeader = new Map(columns.map((column) => [normalize(column.header), column.key]));

    const positionToKey = new Map();
    sheet.getRow(1).eachCell((cell, position) => {
        const key = keyByHeader.get(normalize(cellValue(cell.value)));
        if (key) positionToKey.set(position, key);
    });
    const found = new Set(positionToKey.values());
    const missingHeaders = columns.filter((column) => column.required && !found.has(column.key)).map((column) => column.header);

    const rows = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber === 1) return;
        const values = {};
        let hasAny = false;
        positionToKey.forEach((key, position) => {
            const value = cellValue(row.getCell(position).value);
            if (value !== '' && value != null) hasAny = true;
            values[key] = value;
        });
        if (hasAny) rows.push({ rowNumber, values });
    });

    return { rows, missingHeaders };
};

module.exports = { buildWorkbook, parseWorkbook };

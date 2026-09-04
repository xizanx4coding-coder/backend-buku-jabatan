const xlsx = require('xlsx');

const workbook = xlsx.readFile('BUKU NOMINATIF JABATAN TAHUN 2026 Terbaru.xlsx');
console.log('Sheet names:', workbook.SheetNames);

const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(sheet);
console.log('First row keys:', Object.keys(data[0] || {}));
console.log('First 3 rows:', data.slice(0, 3));

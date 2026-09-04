const xlsx = require('xlsx');

const workbook = xlsx.readFile('BUKU NOMINATIF JABATAN TAHUN 2026 Terbaru.xlsx');
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

for (let i = 0; i < 10; i++) {
  console.log(`Row ${i}:`, rows[i]);
}

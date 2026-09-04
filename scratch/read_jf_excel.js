const XLSX = require('xlsx');
const path = require('path');

function main() {
  const filePath = path.join(__dirname, '..', 'BUKU NOMINATIF JABATAN TAHUN 2026 Terbaru JF.xlsx');
  console.log('Reading excel file:', filePath);
  
  const workbook = XLSX.readFile(filePath, { sheetRows: 5 });
  console.log('Sheet names:', workbook.SheetNames);
  
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  console.log('First 5 rows of sheet 1:', JSON.stringify(data, null, 2));
}

main();

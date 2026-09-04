const xlsx = require('xlsx');
const fs = require('fs');

const workbook = xlsx.readFile('BUKU NOMINATIF JABATAN TAHUN 2026 Terbaru.xlsx');
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

const jobs = new Set();
rows.forEach((row, i) => {
  if (i < 3) return;
  const no = row[0];
  const isEmployeeRow = no !== undefined && no !== null && no !== '' && !isNaN(no);
  if (isEmployeeRow) {
    const rawJab = row[2];
    if (rawJab && typeof rawJab === 'string') {
      const clean = rawJab.replace(/\r?\n|\r/g, ' ').replace(/\s+/g, ' ').trim();
      if (clean && clean.length > 3) {
        jobs.add(clean);
      }
    }
  }
});

const sortedJobs = Array.from(jobs).sort();
console.log(`Found ${sortedJobs.length} unique real job titles.`);
console.log('Sample:', sortedJobs.slice(0, 10));

fs.writeFileSync('public/jobs.json', JSON.stringify(sortedJobs, null, 2));
console.log('Saved to public/jobs.json');

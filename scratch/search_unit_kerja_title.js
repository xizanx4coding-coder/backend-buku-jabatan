const fs = require('fs');
const content = fs.readFileSync('public/index.html', 'utf8');

const indexTitle = content.indexOf('Semua Unit Kerja');
if (indexTitle !== -1) {
  console.log('Around Semua Unit Kerja:', content.substring(indexTitle - 200, indexTitle + 500));
}

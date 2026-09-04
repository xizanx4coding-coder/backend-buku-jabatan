const fs = require('fs');
const content = fs.readFileSync('public/index.html', 'utf8');

const indexKepegawaian = content.indexOf('<!-- Kepegawaian & Jabatan -->');
if (indexKepegawaian !== -1) {
  console.log('Kepegawaian Section:', content.substring(indexKepegawaian, indexKepegawaian + 2000));
}

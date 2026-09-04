const fs = require('fs');
const content = fs.readFileSync('public/index.html', 'utf8');

const indexKep = content.indexOf('Data Kepegawaian');
if (indexKep !== -1) {
  console.log('Kepegawaian info:', content.substring(indexKep - 100, indexKep + 1500));
}

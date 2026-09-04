const fs = require('fs');
const content = fs.readFileSync('public/index.html', 'utf8');

const indexTabKep = content.indexOf('id="tab-kepegawaian"');
if (indexTabKep !== -1) {
  console.log('Tab Kepegawaian:', content.substring(indexTabKep, indexTabKep + 1500));
}

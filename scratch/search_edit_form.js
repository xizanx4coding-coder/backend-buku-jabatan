const fs = require('fs');
const content = fs.readFileSync('public/index.html', 'utf8');

const indexForm = content.indexOf('<form id="pejabat-form"');
if (indexForm !== -1) {
  console.log('Form:', content.substring(indexForm, indexForm + 2500));
}

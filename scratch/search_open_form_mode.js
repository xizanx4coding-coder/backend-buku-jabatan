const fs = require('fs');
const content = fs.readFileSync('public/index.html', 'utf8');

const indexOpen = content.indexOf('function openFormMode');
if (indexOpen !== -1) {
  console.log('openFormMode:', content.substring(indexOpen, indexOpen + 1200));
}

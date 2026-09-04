const fs = require('fs');
const content = fs.readFileSync('public/index.html', 'utf8');

const indexOpd = content.indexOf('function renderOpdList');
if (indexOpd !== -1) {
  console.log('Around renderOpdList:', content.substring(indexOpd, indexOpd + 1200));
}

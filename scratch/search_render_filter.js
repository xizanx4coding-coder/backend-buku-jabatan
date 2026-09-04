const fs = require('fs');
const content = fs.readFileSync('public/index.html', 'utf8');

const indexRender = content.indexOf('function render()');
if (indexRender !== -1) {
  console.log('Around render:', content.substring(indexRender, indexRender + 1200));
}

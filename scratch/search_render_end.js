const fs = require('fs');
const content = fs.readFileSync('public/index.html', 'utf8');

const indexRender = content.indexOf('function render()');
if (indexRender !== -1) {
  console.log('Body of render (lines 1000 onwards):', content.substring(indexRender + 1200, indexRender + 2500));
}

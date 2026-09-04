const fs = require('fs');
const content = fs.readFileSync('public/index.html', 'utf8');

const indexFiltered = content.indexOf('function getFiltered');
if (indexFiltered !== -1) {
  console.log('Around getFiltered:', content.substring(indexFiltered, indexFiltered + 1200));
}

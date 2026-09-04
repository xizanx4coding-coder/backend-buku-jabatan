const fs = require('fs');
const content = fs.readFileSync('public/index.html', 'utf8');

const indexTable = content.indexOf('<th');
if (indexTable !== -1) {
  console.log('Headers:', content.substring(indexTable - 200, indexTable + 1000));
}

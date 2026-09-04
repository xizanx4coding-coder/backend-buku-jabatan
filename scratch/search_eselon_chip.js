const fs = require('fs');
const content = fs.readFileSync('public/index.html', 'utf8');

const indexChip = content.indexOf('function eselonChip');
if (indexChip !== -1) {
  console.log('Around eselonChip:', content.substring(indexChip, indexChip + 800));
}

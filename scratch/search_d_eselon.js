const fs = require('fs');
const content = fs.readFileSync('public/index.html', 'utf8');

const indexEselon = content.indexOf('d-eselon');
if (indexEselon !== -1) {
  console.log('d-eselon surrounding:', content.substring(indexEselon - 200, indexEselon + 1200));
}

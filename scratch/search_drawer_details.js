const fs = require('fs');
const content = fs.readFileSync('public/index.html', 'utf8');

const indexDetail = content.indexOf('<div id="drawer-view-mode"');
if (indexDetail !== -1) {
  console.log('Drawer detail:', content.substring(indexDetail, indexDetail + 1500));
}

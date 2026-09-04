const fs = require('fs');
const content = fs.readFileSync('public/index.html', 'utf8');

const indexTabId = content.indexOf('id="tab-identitas"');
if (indexTabId !== -1) {
  console.log('Tab Identitas:', content.substring(indexTabId, indexTabId + 1500));
}

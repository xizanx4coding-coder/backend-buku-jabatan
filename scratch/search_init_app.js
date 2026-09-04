const fs = require('fs');
const content = fs.readFileSync('public/index.html', 'utf8');

const indexInit = content.indexOf('function initApp()');
if (indexInit !== -1) {
  console.log('initApp:', content.substring(indexInit, indexInit + 1200));
}

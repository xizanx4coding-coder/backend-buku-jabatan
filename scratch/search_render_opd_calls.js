const fs = require('fs');
const content = fs.readFileSync('public/index.html', 'utf8');

const regex = /renderOpdList\(\)/gi;
let match;
while ((match = regex.exec(content)) !== null) {
  console.log(`Match at index ${match.index}`);
  console.log('Around:', content.substring(match.index - 50, match.index + 50));
  console.log('--------------------------------------------------');
}

const fs = require('fs');
const content = fs.readFileSync('public/index.html', 'utf8');

// Find all matches of ".length" or "total" in index.html
const regex = /total|DATA\.length|\.total/gi;
let match;
while ((match = regex.exec(content)) !== null) {
  console.log(`Match at index ${match.index}: "${match[0]}"`);
  console.log('Around:', content.substring(match.index - 50, match.index + 50));
  console.log('--------------------------------------------------');
}

const fs = require('fs');
const content = fs.readFileSync('public/index.html', 'utf8');

// Find all matches of "nama_jabatan" in index.html
const regex = /nama_jabatan/gi;
let match;
while ((match = regex.exec(content)) !== null) {
  console.log(`Match at index ${match.index}: "${match[0]}"`);
  console.log('Around:', content.substring(match.index - 100, match.index + 100));
  console.log('--------------------------------------------------');
}

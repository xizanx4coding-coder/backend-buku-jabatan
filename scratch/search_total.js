const fs = require('fs');
const content = fs.readFileSync('public/index.html', 'utf8');

// Find all matches of 10578
const matches = [];
let index = content.indexOf('10578');
while (index !== -1) {
  matches.push(index);
  index = content.indexOf('10578', index + 1);
}
console.log('Matches for 10578:', matches);

// Let's print around the matches
matches.forEach(m => {
  console.log('Around 10578:', content.substring(m - 100, m + 100));
});

// Let's search for where "pejabat.json" is loaded and how pagination/total is computed in index.html
const indexJson = content.indexOf('pejabat.json');
if (indexJson !== -1) {
  console.log('Around pejabat.json:', content.substring(indexJson - 200, indexJson + 200));
}

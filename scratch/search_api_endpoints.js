const fs = require('fs');
const content = fs.readFileSync('src/server.ts', 'utf8');

const indexApi = content.indexOf("app.put('/api/pejabat/:id'");
if (indexApi !== -1) {
  console.log('API Put:', content.substring(indexApi - 200, indexApi + 1200));
} else {
  // Let's print any api/pejabat endpoints
  const lines = content.split('\n');
  lines.forEach((line, i) => {
    if (line.includes('/api/pejabat')) {
      console.log(`Line ${i + 1}: ${line}`);
    }
  });
}

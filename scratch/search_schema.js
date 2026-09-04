const fs = require('fs');
const glob = require('glob');

// Let's find any model or database setup files
const files = glob.sync('src/**/*.ts');
console.log('TS files:', files);

// Check server.ts database setup
const serverContent = fs.readFileSync('src/server.ts', 'utf8');
const indexDb = serverContent.indexOf('db.');
if (indexDb !== -1) {
  console.log('Database initialization in server.ts:', serverContent.substring(indexDb - 200, indexDb + 1000));
}

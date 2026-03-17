const fs   = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'seen.db');

try {
  fs.unlinkSync(DB_PATH);
  console.log('Database cleared.');
} catch (_) {
  console.log('No database found, nothing to clear.');
}

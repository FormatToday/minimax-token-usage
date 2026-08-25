const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist');

if (!fs.existsSync(dist)) {
  process.exit(0);
}

for (const entry of fs.readdirSync(dist, { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  const name = entry.name;
  if (name.endsWith('.blockmap') || name === 'builder-debug.yml') {
    fs.unlinkSync(path.join(dist, name));
    console.log('[clean-artifacts] removed', name);
  }
}
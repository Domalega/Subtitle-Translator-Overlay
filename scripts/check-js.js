const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git'].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.name.endsWith('.js')) files.push(file);
  }
}
walk(root);
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) process.stderr.write(result.stderr || result.stdout);
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`node --check passed for ${files.length} JavaScript files.`);

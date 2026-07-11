const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const contract = JSON.parse(fs.readFileSync(path.join(root, 'test/contracts/protected-ui-files.json'), 'utf8'));
const errors = [];
for (const [file, expectedHash] of Object.entries(contract.files)) {
  const content = fs.readFileSync(path.join(root, file));
  const hash = crypto.createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex');
  if (hash !== expectedHash) errors.push(`${file} differs from protected UI baseline ${contract.baseline}`);
}
if (errors.length) {
  console.error('Protected UI files changed:');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else console.log('Protected UI files match the baseline.');

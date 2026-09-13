'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file));
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const pkg = JSON.parse(read('package.json'));
const sources = JSON.parse(read('licenses/sources.json'));
assert.equal(pkg.license, 'MIT');
assert.match(read('LICENSE').toString(), /Copyright \(c\) 2026 Domalega/);
for (const entry of sources) {
  assert.equal(digest(read('licenses/' + entry.file)), entry.sha256, entry.file + ': notice changed');
}
const notices = read('THIRD_PARTY_NOTICES.txt').toString();
for (const name of ['tesseract.js', 'tesseract.js-core']) {
  const dependency = JSON.parse(read('node_modules/' + name + '/package.json'));
  assert.ok(notices.toLowerCase().includes(name + ' ' + dependency.version), name + ': update notices when upgrading');
}
const model = read('resources/ocr/eng.traineddata');
assert.equal(model.length, 4113088);
assert.equal(digest(model), '7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2', 'Reverify model provenance after replacement');
const required = new Map([
  ['LICENSE', 'LICENSE'], ['THIRD_PARTY_NOTICES.txt', 'THIRD_PARTY_NOTICES.txt'],
  ['licenses', 'licenses'], ['resources/ocr/README.md', 'ocr-model-README.md'],
  ['resources/ocr/eng.traineddata', 'eng.traineddata']
]);
for (const [from, to] of required) {
  assert.ok(pkg.build.extraResources.some(item => item.from === from && item.to === to), from + ': missing packaging rule');
}
if (process.argv.includes('--dist')) {
  const distribution = path.join(root, 'dist/win-unpacked');
  for (const [from, to] of required) {
    const files = from === 'licenses' ? fs.readdirSync(path.join(root, from)) : [null];
    for (const file of files) {
      const source = file ? from + '/' + file : from;
      const target = path.join(distribution, 'resources', to, ...(file ? [file] : []));
      assert.equal(digest(fs.readFileSync(target)), digest(read(source)), source + ': missing or stale in build');
    }
  }
  for (const file of ['LICENSE.electron.txt', 'LICENSES.chromium.html']) {
    assert.ok(fs.statSync(path.join(distribution, file)).size > 0, file);
  }
}
console.log('License documents, model provenance and packaging rules verified' + (process.argv.includes('--dist') ? ' against built distribution.' : '.'));

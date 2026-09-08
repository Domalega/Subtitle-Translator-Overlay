'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = fs.realpathSync(path.resolve(__dirname, '..'));
function testFiles(folder) {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(folder, entry.name);
    return entry.isDirectory() ? testFiles(file) : entry.name.endsWith('.test.js') ? [file] : [];
  });
}
const tests = testFiles(path.join(root, 'test/unit')).sort();
if (!tests.length) throw new Error('No unit tests found');
const coverage = process.argv.includes('--coverage');
const args = coverage ? [
  path.join(root, 'node_modules/c8/bin/c8.js'), '--all', '--include=src/**/*.js',
  '--check-coverage', '--lines=90', '--branches=75', '--functions=85',
  '--reporter=text', '--reporter=html', '--reporter=json', '--reporter=json-summary',
  process.execPath, '--test', ...tests
] : ['--test', ...tests];
const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', windowsHide: true });
if (result.error) console.error(result.error);
process.exitCode = result.status === 0 ? 0 : 1;

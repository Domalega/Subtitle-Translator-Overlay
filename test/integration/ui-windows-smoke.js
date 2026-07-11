const { spawn } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const electron = require('electron');
const child = spawn(electron, ['.', '--ui-smoke'], {
  cwd: root,
  env: { ...process.env, UI_SMOKE: '1' },
  stdio: 'inherit',
  windowsHide: true
});
const timeout = setTimeout(() => {
  child.kill();
  console.error('UI smoke test timed out after 30 seconds.');
  process.exitCode = 1;
}, 30000);
child.on('exit', (code) => {
  clearTimeout(timeout);
  process.exitCode = code || 0;
});
child.on('error', (error) => {
  clearTimeout(timeout);
  console.error(error);
  process.exitCode = 1;
});

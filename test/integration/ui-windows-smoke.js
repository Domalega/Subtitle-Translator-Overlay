'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = fs.realpathSync(path.resolve(__dirname, '..', '..'));
const electron = require('electron');
const temporaryRoot = fs.realpathSync(os.tmpdir());
const userData = fs.mkdtempSync(path.join(temporaryRoot, 'subtitle-overlay-ui-smoke-'));
const env = { ...process.env, UI_SMOKE: '1', UI_SMOKE_USER_DATA: userData };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ['.', '--ui-smoke'], { cwd: root, env, stdio: 'inherit', windowsHide: true });
let timedOut = false;
const timeout = setTimeout(() => {
  timedOut = true; child.kill();
  console.error('UI smoke test timed out after 45 seconds.');
}, 45000);
child.on('close', code => {
  clearTimeout(timeout);
  process.exitCode = !timedOut && code === 0 ? 0 : 1;
  if (path.dirname(userData) === temporaryRoot && path.basename(userData).startsWith('subtitle-overlay-ui-smoke-')) {
    try { fs.rmSync(userData, { recursive: true, force: true, maxRetries: 3 }); } catch (error) { console.error('Could not remove isolated smoke profile:', error.message); }
  }
});
child.on('error', error => { clearTimeout(timeout); console.error(error); process.exitCode = 1; });

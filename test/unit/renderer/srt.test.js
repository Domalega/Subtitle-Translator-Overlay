'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { rendererHarness } = require('../../helpers/renderer-harness');
test('legacy SRT parser rejects invalid timestamps, sorts cues and uses exclusive end times', async t => {
  const h = rendererHarness(t, 'renderer/main/index.html'); await h.flush();
  const srt = '2\n00:00:02,000 --> 00:00:03,000\n<b>Second</b>\n\n1\n00:00:01,000 --> 00:00:02,000\nFirst\n\n3\n00:99:01,000 --> 00:00:02,000\nInvalid';
  const cues = h.evaluate('cues = parseSrt(' + JSON.stringify(srt) + ')');
  assert.equal(cues.length, 2); assert.equal(cues[0].text, 'First'); assert.equal(cues[1].text, 'Second');
  assert.equal(h.evaluate('findCueIndex(2000)'), 1); assert.equal(h.evaluate('findCueIndex(3000)'), -1);
});
test('late SRT translation cannot overwrite a newer cue', async t => {
  let finish;
  const h = rendererHarness(t, 'renderer/main/index.html', { translate: text => text === 'First' ? new Promise(resolve => { finish = resolve; }) : Promise.resolve('Second translation') });
  await h.flush();
  h.evaluate("cues = [{ text: 'First' }, { text: 'Second' }]");
  const first = h.evaluate('showCue(0)'); await h.evaluate('showCue(1)');
  finish('Old translation'); await first;
  assert.equal(h.document.getElementById('russianText').textContent, 'Second translation');
  await h.evaluate('showCue(-1)'); assert.equal(h.document.getElementById('russianText').textContent, '');
});
test('legacy playback preserves elapsed time when paused', async t => {
  const h = rendererHarness(t, 'renderer/main/index.html'); await h.flush();
  h.evaluate('setRunning(true); startedAt = performance.now() - 2500; setRunning(false)');
  assert.ok(h.evaluate('pausedAt') >= 2500);
});

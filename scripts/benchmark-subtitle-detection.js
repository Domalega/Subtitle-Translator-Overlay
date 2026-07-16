#!/usr/bin/env node
'use strict';
const { performance } = require('node:perf_hooks');
const { buildSubtitleEnvelope } = require('../src/shared/ocr/subtitle-candidate-validator');

function createFrame(width, height) {
  const frame = { width, height, data: new Uint8Array(width * height * 4), pixelOrder: 'rgba' };
  const lineY = Math.floor(height * 0.82); const startX = Math.floor(width * 0.22);
  for (const y of [lineY, lineY + Math.max(18, Math.floor(height * 0.025))]) {
    for (let word = 0; word < 12; word += 1) for (let row = 0; row < Math.max(6, Math.floor(height * 0.006)); row += 1) for (let x = startX + word * Math.floor(width * 0.045); x < startX + word * Math.floor(width * 0.045) + Math.floor(width * 0.03); x += 1) {
      const offset = ((y + row) * width + x) * 4; frame.data[offset] = 255; frame.data[offset + 1] = 255; frame.data[offset + 2] = 255; frame.data[offset + 3] = 255;
    }
  }
  for (let y = lineY; y < lineY + 10; y += 1) for (let x = Math.floor(width * 0.86); x < Math.floor(width * 0.94); x += 1) {
    const offset = (y * width + x) * 4; frame.data[offset] = 255; frame.data[offset + 1] = 255; frame.data[offset + 2] = 255; frame.data[offset + 3] = 255;
  }
  return { frame, seed: { x: Math.floor(width * 0.48), y: lineY, width: Math.floor(width * 0.04), height: Math.max(10, Math.floor(height * 0.012)) } };
}

for (const [width, height] of [[1920, 1080], [2560, 1440], [3840, 2160]]) {
  const { frame, seed } = createFrame(width, height); const iterations = 30;
  buildSubtitleEnvelope(frame, seed);
  const started = performance.now();
  for (let index = 0; index < iterations; index += 1) buildSubtitleEnvelope(frame, seed);
  const average = (performance.now() - started) / iterations;
  console.log(`${width}x${height}: ${average.toFixed(3)} ms/op (${iterations} iterations)`);
}

'use strict';
const fs = require('node:fs'); const path = require('node:path'); const { PNG } = require('pngjs');
const { detectSubtitleArea } = require('../src/shared/ocr/subtitle-area-detector'); const { buildSubtitleEnvelope, validateSubtitleCandidate } = require('../src/shared/ocr/subtitle-candidate-validator');
const root = process.argv[2];
if (!root) { console.error('Usage: npm run check:detection-samples -- <diagnostics-folder>'); process.exitCode = 1; } else {
  try {
    const folders = fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => path.join(root, entry.name)); let count = 0;
    for (const folder of folders) {
      const sourcePath = path.join(folder, 'detection-source.png'); if (!fs.existsSync(sourcePath)) continue;
      const png = PNG.sync.read(fs.readFileSync(sourcePath)); const image = { width: png.width, height: png.height, data: png.data, pixelOrder: 'rgba' }; const detection = detectSubtitleArea(image); const seed = detection.bestCandidate; const expanded = seed ? buildSubtitleEnvelope(image, seed) : null; const validation = expanded ? validateSubtitleCandidate(image, expanded) : { valid: false, reason: detection.metrics.fallbackUsed ? 'no-seed-1024' : 'no-seed-640' };
      console.log(`${path.basename(folder)}: capture ${png.width}x${png.height}; seeds ${detection.candidates.length}; best ${seed ? `${seed.x},${seed.y} ${seed.width}x${seed.height} score ${seed.score}` : '-'}; expanded ${expanded ? `${expanded.x},${expanded.y} ${expanded.width}x${expanded.height}` : '-'}; rows ${validation.rowCount || 0}; validation ${validation.reason}; accepted ${validation.valid}`); count += 1;
    }
    console.log(`Checked ${count} detection sample(s).`);
  } catch (error) { console.error(error.stack || error.message); process.exitCode = 1; }
}

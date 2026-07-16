'use strict';
const { clampLocalArea } = require('./ocr-area-coordinates');

function bright(data, offset, order) {
  const red = order === 'bgra' ? data[offset + 2] : data[offset]; const green = data[offset + 1]; const blue = order === 'bgra' ? data[offset] : data[offset + 2];
  const maximum = Math.max(red, green, blue); const minimum = Math.min(red, green, blue);
  return (maximum >= 205 && minimum >= 145) || (red >= 170 && green >= 115 && blue <= 170 && red >= blue + 40);
}
function validateSubtitleCandidate(image, candidate) {
  if (!image?.data || !Number.isFinite(image.width) || !Number.isFinite(image.height)) return { valid: false, score: 0, componentCount: 0, rowCount: 0, brightPixelRatio: 0, textLikePixelRatio: 0, reason: 'invalid-image' };
  const area = clampLocalArea(candidate, image); const order = image.pixelOrder === 'bgra' ? 'bgra' : 'rgba'; let brightPixels = 0; let components = 0; const rows = [];
  for (let y = area.y; y < area.y + area.height; y += 1) {
    let count = 0; let runs = 0; let inRun = false; let left = area.width; let right = -1;
    for (let x = area.x; x < area.x + area.width; x += 1) {
      if (bright(image.data, (y * image.width + x) * 4, order)) { brightPixels += 1; count += 1; left = Math.min(left, x); right = Math.max(right, x); if (!inRun) { runs += 1; inRun = true; } } else inRun = false;
    }
    components += runs;
    if (count >= Math.max(2, Math.ceil(area.width * 0.008)) && right - left + 1 >= Math.max(4, Math.ceil(area.width * 0.08))) rows.push(y);
  }
  let rowCount = 0; let previous = -Infinity; for (const y of rows) { if (y > previous + 2) rowCount += 1; previous = y; }
  const pixelCount = area.width * area.height; const brightPixelRatio = brightPixels / Math.max(1, pixelCount); const textLikePixelRatio = rows.length / Math.max(1, area.height);
  const touchesLeft = rows.some((y) => { for (let x = area.x; x < Math.min(area.x + 3, area.x + area.width); x += 1) if (bright(image.data, (y * image.width + x) * 4, order)) return true; return false; });
  const touchesRight = rows.some((y) => { for (let x = Math.max(area.x, area.x + area.width - 3); x < area.x + area.width; x += 1) if (bright(image.data, (y * image.width + x) * 4, order)) return true; return false; });
  const textScore = Math.round(Math.min(70, brightPixelRatio * 350 + Math.min(30, components / 4) + rowCount * 10));
  const completenessScore = Math.max(0, 30 - (touchesLeft ? 12 : 0) - (touchesRight ? 12 : 0)); const score = textScore + completenessScore;
  let status = 'rejected'; let reason = 'low-text-density';
  if (brightPixels === 0 || components < 2) reason = 'no-bright-components';
  else if (touchesLeft || touchesRight) { status = 'incomplete'; reason = 'components-touch-guard'; }
  else if (brightPixelRatio >= 0.003 && rowCount >= 1) { status = rows.length >= 2 ? 'accepted' : 'accepted-low-confidence'; reason = status === 'accepted' ? 'text-components-confirmed' : 'short-text-confirmation-needed'; }
  return { valid: status === 'accepted' || status === 'accepted-low-confidence', status, score, textScore, completenessScore, componentCount: components, rowCount, brightPixelRatio, textLikePixelRatio, componentsTouchingLeftGuard: touchesLeft, componentsTouchingRightGuard: touchesRight, reason };
}
function buildSubtitleEnvelope(image, seed) {
  const area = clampLocalArea(seed, image); const order = image.pixelOrder === 'bgra' ? 'bgra' : 'rgba';
  const maxWidth = Math.max(1, Math.floor(image.width * 0.78)); const maxHeight = Math.max(1, Math.floor(image.height * 0.18));
  const verticalPad = Math.max(16, area.height * 3); const top = Math.max(0, Math.floor(area.y - verticalPad)); const bottom = Math.min(image.height, Math.ceil(area.y + area.height + verticalPad));
  const maxSegmentGap = Math.max(8, Math.ceil(area.width * 0.16), Math.ceil(image.width * 0.025)); const minRunPixels = 2; const minSegmentPixels = Math.max(3, Math.ceil(area.width * 0.025));
  const rows = [];
  for (let y = top; y < bottom; y += 1) {
    const segments = []; let runStart = -1; let runPixels = 0; let segment = null;
    for (let x = 0; x < image.width; x += 1) {
      if (bright(image.data, (y * image.width + x) * 4, order)) { if (runStart < 0) runStart = x; runPixels += 1; }
      else if (runStart >= 0) {
        if (runPixels >= minRunPixels) {
          if (segment && runStart - segment.right <= maxSegmentGap) { segment.right = x - 1; segment.pixels += runPixels; }
          else { segment = { y, left: runStart, right: x - 1, pixels: runPixels }; segments.push(segment); }
        }
        runStart = -1; runPixels = 0;
      }
    }
    if (runStart >= 0 && runPixels >= minRunPixels) {
      if (segment && runStart - segment.right <= maxSegmentGap) { segment.right = image.width - 1; segment.pixels += runPixels; }
      else segments.push({ y, left: runStart, right: image.width - 1, pixels: runPixels });
    }
    const denseSegments = segments.filter((segment) => {
      const width = segment.right - segment.left + 1; const density = segment.pixels / Math.max(1, width);
      return segment.pixels >= minSegmentPixels && width <= maxWidth && density >= 0.08;
    });
    if (denseSegments.length) rows.push({ y, segments: denseSegments });
  }
  const seedLeft = area.x; const seedRight = area.x + area.width - 1; const seedCenterX = area.x + area.width / 2; const groups = [];
  const overlaps = (aLeft, aRight, bLeft, bRight, gap) => aLeft <= bRight + gap && bLeft <= aRight + gap;
  for (const row of rows) {
    for (const segment of row.segments) {
      let best = null;
      for (const group of groups) if (row.y <= group.bottom + 3 && overlaps(segment.left, segment.right, group.left, group.right, maxSegmentGap)) { best = group; break; }
      if (best) { best.bottom = row.y; best.left = Math.min(best.left, segment.left); best.right = Math.max(best.right, segment.right); best.pixels += segment.pixels; best.rows += 1; }
      else groups.push({ top: row.y, bottom: row.y, left: segment.left, right: segment.right, pixels: segment.pixels, rows: 1 });
    }
  }
  const seedCenterY = area.y + area.height / 2; const related = groups.filter((group) => {
    const width = group.right - group.left + 1; const height = group.bottom - group.top + 1; const density = group.pixels / Math.max(1, width * height);
    const nearSeedY = Math.abs((group.top + group.bottom) / 2 - seedCenterY) <= Math.max(36, area.height * 4);
    const linkedToSeedX = overlaps(group.left, group.right, seedLeft, seedRight, Math.max(maxSegmentGap, area.width * 1.5)) || (seedCenterX >= group.left && seedCenterX <= group.right);
    return nearSeedY && linkedToSeedX && width <= maxWidth && height <= maxHeight && density >= 0.025;
  }).sort((a, b) => Math.abs((a.top + a.bottom) / 2 - seedCenterY) - Math.abs((b.top + b.bottom) / 2 - seedCenterY)).slice(0, 3);
  if (!related.length) return area;
  let left = Math.min(...related.map((group) => group.left)); let right = Math.max(...related.map((group) => group.right)); let y = Math.max(0, Math.min(...related.map((group) => group.top)) - 6); let bottomY = Math.min(image.height, Math.max(...related.map((group) => group.bottom)) + 7);
  if (right - left + 1 > maxWidth) { const center = Math.round((Math.max(left, seedLeft) + Math.min(right, seedRight)) / 2); left = Math.max(0, center - Math.floor(maxWidth / 2)); right = Math.min(image.width - 1, left + maxWidth - 1); left = Math.max(0, right - maxWidth + 1); }
  if (bottomY - y > maxHeight) { const center = Math.round(seedCenterY); y = Math.max(0, center - Math.floor(maxHeight / 2)); bottomY = Math.min(image.height, y + maxHeight); y = Math.max(0, bottomY - maxHeight); }
  let envelopeLeft = Math.max(0, left - 8); let envelopeRight = Math.min(image.width, right + 9);
  if (envelopeRight - envelopeLeft > maxWidth) { const center = Math.round(seedCenterX); envelopeLeft = Math.max(0, center - Math.floor(maxWidth / 2)); envelopeRight = Math.min(image.width, envelopeLeft + maxWidth); envelopeLeft = Math.max(0, envelopeRight - maxWidth); }
  return clampLocalArea({ x: envelopeLeft, y, width: envelopeRight - envelopeLeft, height: bottomY - y }, image);
}
module.exports = { validateSubtitleCandidate, buildSubtitleEnvelope };

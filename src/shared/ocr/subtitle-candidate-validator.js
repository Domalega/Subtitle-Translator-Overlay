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
  const top = Math.max(0, area.y - Math.max(16, area.height * 3)); const bottom = Math.min(image.height, area.y + area.height + Math.max(16, area.height * 3)); const rows = [];
  for (let y = top; y < bottom; y += 1) {
    let left = image.width; let right = -1; let count = 0;
    for (let x = 0; x < image.width; x += 1) if (bright(image.data, (y * image.width + x) * 4, order)) { left = Math.min(left, x); right = Math.max(right, x); count += 1; }
    if (right >= left && count >= Math.max(3, image.width * 0.002)) rows.push({ y, left, right });
  }
  const groups = [];
  for (const row of rows) { const group = groups[groups.length - 1]; if (group && row.y <= group.bottom + 3) { group.bottom = row.y; group.left = Math.min(group.left, row.left); group.right = Math.max(group.right, row.right); } else groups.push({ top: row.y, bottom: row.y, left: row.left, right: row.right }); }
  const seedCenter = area.y + area.height / 2; const related = groups.filter((group) => Math.abs((group.top + group.bottom) / 2 - seedCenter) <= Math.max(36, area.height * 4)).slice(0, 3);
  if (!related.length) return area;
  const left = Math.min(...related.map((group) => group.left)); const right = Math.max(...related.map((group) => group.right)); const envelope = { x: Math.max(0, left - 8), y: Math.max(0, Math.min(...related.map((group) => group.top)) - 6), width: Math.min(image.width, right + 9) - Math.max(0, left - 8), height: Math.min(image.height, Math.max(...related.map((group) => group.bottom)) + 7) - Math.max(0, Math.min(...related.map((group) => group.top)) - 6) };
  return clampLocalArea(envelope, image);
}
module.exports = { validateSubtitleCandidate, buildSubtitleEnvelope };

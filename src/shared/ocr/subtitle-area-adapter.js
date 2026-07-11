'use strict';

function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }

function brightTextPixel(data, offset, pixelOrder) {
  const red = pixelOrder === 'bgra' ? data[offset + 2] : data[offset];
  const green = data[offset + 1];
  const blue = pixelOrder === 'bgra' ? data[offset] : data[offset + 2];
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  return (maximum >= 210 && minimum >= 150) || (red >= 175 && green >= 120 && blue <= 165 && red >= blue + 45);
}

function findTextBands(image, area) {
  const width = Math.max(0, Math.round(image?.width));
  const height = Math.max(0, Math.round(image?.height));
  const data = image?.data;
  if (!data || width < 1 || height < 1 || data.length < width * height * 4) return [];
  const rows = [];
  const minimumWidth = Math.max(18, Math.round(area.width * 0.22));
  for (let y = 0; y < height; y += 1) {
    let left = width;
    let right = -1;
    let count = 0;
    for (let x = 0; x < width; x += 1) {
      if (!brightTextPixel(data, (y * width + x) * 4, image.pixelOrder)) continue;
      left = Math.min(left, x); right = Math.max(right, x); count += 1;
    }
    if (right >= left && right - left + 1 >= minimumWidth && count >= 4) rows.push({ top: y, bottom: y, left, right, count });
  }
  const bands = [];
  for (const row of rows) {
    const previous = bands[bands.length - 1];
    if (previous && row.top <= previous.bottom + 3 && row.left <= previous.right + 16 && row.right >= previous.left - 16) {
      previous.bottom = row.bottom; previous.left = Math.min(previous.left, row.left); previous.right = Math.max(previous.right, row.right); previous.count += row.count;
    } else bands.push(row);
  }
  const center = width / 2;
  return bands.filter((band) => band.bottom - band.top + 1 >= 2 && Math.abs((band.left + band.right) / 2 - center) <= Math.max(area.width * 0.32, 48));
}

function similarArea(left, right, tolerance = 3) {
  return left && right && Math.abs(left.y - right.y) <= tolerance && Math.abs(left.height - right.height) <= tolerance;
}

function adaptSubtitleArea({ area, screen, image, state = {}, now = 0, confirmFrames = 2, shrinkDelayMs = 2000 } = {}) {
  if (!area || !screen) return { area: area || null, changed: false, lineCountEstimate: null, expandedTop: false, expandedBottom: false, reason: 'invalid-input', state };
  const current = { x: Math.round(area.x), y: Math.round(area.y), width: Math.max(1, Math.round(area.width)), height: Math.max(1, Math.round(area.height)) };
  const originY = Number.isFinite(image?.originY) ? image.originY : current.y;
  const bands = findTextBands(image, current);
  const localTop = current.y - originY;
  const localBottom = localTop + current.height;
  const outside = bands.filter((band) => band.bottom < localTop + 5 || band.top > localBottom - 5);
  const topBand = outside.filter((band) => band.bottom < localTop + 5).pop();
  const bottomBand = outside.find((band) => band.top > localBottom - 5);
  const maxHeight = Math.max(current.height, Math.floor(screen.height * 0.2));
  let target = { ...current };
  if (topBand) {
    const top = clamp(originY + topBand.top - 7, 0, current.y);
    target.y = top; target.height = current.y + current.height - top;
  }
  if (bottomBand) target.height = Math.max(target.height, clamp(originY + bottomBand.bottom + 8 - target.y, current.height, maxHeight));
  target.height = Math.min(target.height, maxHeight, screen.height - target.y);
  const expandedTop = target.y < current.y - 3;
  const expandedBottom = target.y + target.height > current.y + current.height + 3;
  const hasExpansion = expandedTop || expandedBottom;
  const candidateState = { ...state, baseArea: state.baseArea || { ...current } };
  const lineCountEstimate = Math.min(3, Math.max(1, bands.filter((band) => band.bottom >= target.y - originY && band.top <= target.y + target.height - originY).length));
  if (hasExpansion) {
    const strong = (topBand && topBand.right - topBand.left + 1 >= current.width * 0.65) || (bottomBand && bottomBand.right - bottomBand.left + 1 >= current.width * 0.65);
    const pending = similarArea(candidateState.pendingArea, target) ? { ...candidateState.pendingArea, count: candidateState.pendingArea.count + 1 } : { ...target, count: 1 };
    candidateState.pendingArea = pending; candidateState.noExtraSince = null; candidateState.noExtraCount = 0;
    if (strong || pending.count >= confirmFrames) return { area: target, changed: !similarArea(current, target), lineCountEstimate, expandedTop, expandedBottom, reason: expandedTop && expandedBottom ? 'additional-lines' : expandedTop ? 'second-line-above' : 'second-line-below', state: { ...candidateState, pendingArea: null, expanded: true } };
    return { area: current, changed: false, lineCountEstimate, expandedTop: false, expandedBottom: false, reason: 'awaiting-confirmation', state: candidateState };
  }
  candidateState.pendingArea = null;
  if (candidateState.expanded) {
    candidateState.noExtraSince = candidateState.noExtraSince || now;
    candidateState.noExtraCount = (candidateState.noExtraCount || 0) + 1;
    if (now - candidateState.noExtraSince >= shrinkDelayMs && candidateState.noExtraCount >= confirmFrames + 1) {
      const base = candidateState.baseArea;
      return { area: base, changed: !similarArea(current, base), lineCountEstimate, expandedTop: false, expandedBottom: false, reason: 'stable-extra-line-absent', state: { ...candidateState, expanded: false, noExtraSince: null, noExtraCount: 0 } };
    }
    return { area: current, changed: false, lineCountEstimate, expandedTop: false, expandedBottom: false, reason: 'retaining-expanded-area', state: candidateState };
  }
  return { area: current, changed: false, lineCountEstimate, expandedTop: false, expandedBottom: false, reason: 'stable-area', state: candidateState };
}

module.exports = { adaptSubtitleArea, findTextBands };

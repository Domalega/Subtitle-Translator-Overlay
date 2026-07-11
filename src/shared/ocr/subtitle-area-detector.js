'use strict';

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function pixelAt(data, width, x, y, pixelOrder) {
  const offset = (y * width + x) * 4;
  if (pixelOrder === 'bgra') return { red: data[offset + 2], green: data[offset + 1], blue: data[offset] };
  return { red: data[offset], green: data[offset + 1], blue: data[offset + 2] };
}

function isBrightSubtitlePixel(pixel) {
  const maximum = Math.max(pixel.red, pixel.green, pixel.blue);
  const minimum = Math.min(pixel.red, pixel.green, pixel.blue);
  const white = maximum >= 210 && minimum >= 150;
  const yellow = pixel.red >= 175 && pixel.green >= 120 && pixel.blue <= 165 && pixel.red >= pixel.blue + 45;
  return white || yellow;
}

function isDark(pixel) {
  return Math.max(pixel.red, pixel.green, pixel.blue) < 85;
}

function downscale(image) {
  const sourceWidth = Math.max(1, Math.floor(image.width));
  const sourceHeight = Math.max(1, Math.floor(image.height));
  const width = Math.min(640, sourceWidth);
  const height = Math.max(1, Math.round(sourceHeight * width / sourceWidth));
  const pixels = new Uint8Array(width * height);
  const darkPixels = new Uint8Array(width * height);
  const pixelOrder = image.pixelOrder === 'bgra' ? 'bgra' : 'rgba';
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(sourceHeight - 1, Math.floor(y * sourceHeight / height));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(sourceWidth - 1, Math.floor(x * sourceWidth / width));
      const pixel = pixelAt(image.data, sourceWidth, sourceX, sourceY, pixelOrder);
      const index = y * width + x;
      pixels[index] = isBrightSubtitlePixel(pixel) ? 1 : 0;
      darkPixels[index] = isDark(pixel) ? 1 : 0;
    }
  }
  return { width, height, pixels, darkPixels };
}

function collectBands(scaled) {
  const startY = Math.floor(scaled.height * 0.3);
  const bands = [];
  for (let y = startY; y < scaled.height; y += 1) {
    const segments = [];
    let left = -1;
    let right = -1;
    let count = 0;
    let gap = 0;
    for (let x = 0; x < scaled.width; x += 1) {
      if (scaled.pixels[y * scaled.width + x]) {
        if (left < 0) left = x;
        right = x;
        count += 1;
        gap = 0;
      } else if (left >= 0) {
        gap += 1;
        if (gap > 12) {
          segments.push({ left, right, count });
          left = -1;
          right = -1;
          count = 0;
          gap = 0;
        }
      }
    }
    if (left >= 0) segments.push({ left, right, count });
    for (const segment of segments) {
      if (segment.count < 3) continue;
      const band = bands.find((entry) => entry.lastY >= y - 3 && entry.lastY <= y && segment.left <= entry.right + 12 && segment.right >= entry.left - 12);
      if (band) {
        band.lastY = y;
        band.left = Math.min(band.left, segment.left);
        band.right = Math.max(band.right, segment.right);
        band.count += segment.count;
        band.rows += 1;
      } else {
        bands.push({ top: y, lastY: y, left: segment.left, right: segment.right, count: segment.count, rows: 1 });
      }
    }
  }
  return bands.filter((band) => {
    const width = band.right - band.left + 1;
    const height = band.lastY - band.top + 1;
    return width >= Math.max(18, scaled.width * 0.04) && height >= 2;
  });
}

function mergeBands(bands) {
  const groups = [];
  for (const band of bands) {
    const group = groups[groups.length - 1];
    const groupWidth = group ? group.right - group.left + 1 : 0;
    const bandWidth = band.right - band.left + 1;
    const gap = group ? band.top - group.bottom - 1 : Infinity;
    const aligned = group && Math.abs((band.left + band.right) / 2 - (group.left + group.right) / 2) <= Math.max(groupWidth, bandWidth) * 0.3;
    const comparable = group && bandWidth >= groupWidth * 0.35 && bandWidth <= groupWidth * 2.8;
    if (group && group.lines < 3 && gap <= 14 && aligned && comparable) {
      group.bottom = band.lastY;
      group.left = Math.min(group.left, band.left);
      group.right = Math.max(group.right, band.right);
      group.count += band.count;
      group.lines += 1;
    } else {
      groups.push({ top: band.top, bottom: band.lastY, left: band.left, right: band.right, count: band.count, lines: 1 });
    }
  }
  return groups;
}

function scoreGroup(group, scaled) {
  const width = group.right - group.left + 1;
  const height = group.bottom - group.top + 1;
  const area = width * height;
  const density = group.count / Math.max(1, area);
  const centerX = (group.left + group.right) / 2 / scaled.width;
  const centerY = (group.top + group.bottom) / 2 / scaled.height;
  const horizontal = width / Math.max(1, height);
  const edgeDistance = Math.min(group.left, scaled.width - 1 - group.right) / scaled.width;
  const widthRatio = width / scaled.width;
  if (centerX < 0.15 || centerX > 0.85 || widthRatio < 0.15 || widthRatio > 0.75) return null;
  let outlineCount = 0;
  let brightCount = 0;
  for (let y = Math.max(0, group.top - 1); y <= Math.min(scaled.height - 1, group.bottom + 1); y += 1) {
    for (let x = Math.max(0, group.left - 1); x <= Math.min(scaled.width - 1, group.right + 1); x += 1) {
      if (!scaled.pixels[y * scaled.width + x]) continue;
      brightCount += 1;
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          const nearX = x + offsetX;
          const nearY = y + offsetY;
          if (nearX >= 0 && nearX < scaled.width && nearY >= 0 && nearY < scaled.height && scaled.darkPixels[nearY * scaled.width + nearX]) outlineCount += 1;
        }
      }
    }
  }
  const outline = outlineCount / Math.max(1, brightCount * 3);
  const reasons = [];
  let score = 0;
  const centerScore = Math.max(0, 1 - Math.abs(centerX - 0.5) / 0.35);
  score += centerScore * 38; if (centerScore > 0.65) reasons.push('centered');
  if (centerX < 0.3 || centerX > 0.7) score -= 25;
  let verticalScore = 0;
  if (centerY >= 0.65) { verticalScore = 30; reasons.push('lower-screen'); }
  else if (centerY >= 0.45) { verticalScore = 16 + (centerY - 0.45) * 70; reasons.push('middle-screen'); }
  else verticalScore = clamp((centerY - 0.3) * 30, 0, 5);
  score += verticalScore;
  const shapeScore = clamp((horizontal - 2) / 8, 0, 1);
  score += shapeScore * 20; if (horizontal >= 2.5) reasons.push('horizontal');
  const densityScore = density >= 0.025 && density <= 0.6 ? 1 - Math.abs(density - 0.16) / 0.5 : 0;
  score += clamp(densityScore, 0, 1) * 14; if (densityScore > 0.35) reasons.push('text-density');
  score += Math.min(3, group.lines) * 4; if (group.lines > 1) reasons.push('multiple-lines');
  score += clamp(outline, 0, 1) * 8; if (outline > 0.08) reasons.push('dark-outline');
  if (height < 3) score -= 25;
  if (height > scaled.height * 0.18 || horizontal < 1.8) score -= 30;
  if (edgeDistance < 0.025) score -= 18;
  if (density > 0.75) score -= 25;
  return { score: Math.round(clamp(score, 0, 100)), confidence: Math.round(clamp(score, 0, 100)), reasons, left: group.left, top: group.top, width, height };
}

function scaleCandidate(candidate, sourceWidth, sourceHeight, scaledWidth, scaledHeight) {
  const padding = 4;
  const left = clamp(Math.floor((candidate.left - padding) * sourceWidth / scaledWidth), 0, sourceWidth - 1);
  const top = clamp(Math.floor((candidate.top - padding) * sourceHeight / scaledHeight), 0, sourceHeight - 1);
  const right = clamp(Math.ceil((candidate.left + candidate.width + padding) * sourceWidth / scaledWidth), left + 1, sourceWidth);
  const bottom = clamp(Math.ceil((candidate.top + candidate.height + padding) * sourceHeight / scaledHeight), top + 1, sourceHeight);
  return { x: left, y: top, width: right - left, height: bottom - top, score: candidate.score, confidence: candidate.confidence, reasons: candidate.reasons };
}

function detectSubtitleArea(image) {
  const startedAt = performance.now();
  const sourceWidth = Number.isFinite(image?.width) ? Math.floor(image.width) : 0;
  const sourceHeight = Number.isFinite(image?.height) ? Math.floor(image.height) : 0;
  if (sourceWidth < 1 || sourceHeight < 1 || !image?.data || image.data.length < sourceWidth * sourceHeight * 4) {
    return { found: false, bestCandidate: null, candidates: [], metrics: { durationMs: performance.now() - startedAt, analyzedWidth: 0, analyzedHeight: 0 } };
  }
  const scaled = downscale(image);
  const candidates = mergeBands(collectBands(scaled))
    .map((group) => scoreGroup(group, scaled))
    .filter(Boolean)
    .filter((candidate) => candidate.score >= 42)
    .sort((left, right) => right.score - left.score)
    .slice(0, 8)
    .map((candidate) => scaleCandidate(candidate, sourceWidth, sourceHeight, scaled.width, scaled.height));
  return {
    found: candidates.length > 0,
    bestCandidate: candidates[0] || null,
    candidates,
    metrics: { durationMs: performance.now() - startedAt, analyzedWidth: scaled.width, analyzedHeight: scaled.height }
  };
}

module.exports = { detectSubtitleArea };

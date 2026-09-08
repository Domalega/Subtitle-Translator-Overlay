'use strict';
const { PNG } = require('pngjs');

// Isolate aligned glyphs before OCR. Bright scenery is not text just because it
// passes the colour threshold. Input is Electron's BGRA bitmap; output is opaque
// dark text on white, with a small border for Tesseract's page segmentation.
function prepareSubtitleImage({ data, width, height, pixelOrder = 'bgra' }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || data?.length !== width * height * 4) throw new Error('Invalid subtitle bitmap');
  const count = width * height;
  const labels = new Int32Array(count);
  const queue = new Int32Array(count);
  for (let p = 0; p < count; p++) {
    const o = p * 4, r = data[o + (pixelOrder === 'bgra' ? 2 : 0)], g = data[o + 1], b = data[o + (pixelOrder === 'bgra' ? 0 : 2)];
    const maximum = Math.max(r, g, b), minimum = Math.min(r, g, b);
    labels[p] = data[o + 3] > 0 && ((maximum > 175 && maximum - minimum < 95) || (r >= 170 && g >= 115 && b <= 170 && r >= b + 40)) ? -1 : 0;
  }
  const components = [];
  for (let p = 0; p < count; p++) {
    if (labels[p] !== -1) continue;
    const id = components.length + 1;
    let head = 0, tail = 1, left = width, right = 0, top = height, bottom = 0;
    queue[0] = p; labels[p] = id;
    while (head < tail) {
      const at = queue[head++], x = at % width, y = Math.floor(at / width);
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (labels[next] === -1) { labels[next] = id; queue[tail++] = next; }
      }
    }
    components.push({ id, left, right, top, bottom, width: right - left + 1, height: bottom - top + 1, pixels: tail });
  }
  const interior = components.filter(c => c.left > 0 && c.top > 0 && c.right < width - 1 && c.bottom < height - 1);
  const plausible = interior.filter(c => c.height >= 6 && c.width <= c.height * 2.5 && c.pixels >= 8);
  const heights = plausible.map(c => c.height).sort((a, b) => a - b);
  const typicalHeight = heights[Math.floor(heights.length / 2)] || 0;
  const glyphs = plausible.filter(c => c.height >= typicalHeight * 0.55 && c.height <= typicalHeight * 1.9);
  const lines = [];
  for (const c of glyphs.sort((a, b) => b.height - a.height)) {
    const center = (c.top + c.bottom) / 2;
    const line = lines.find(l => Math.abs(center - l.center) <= Math.min(c.height, l.height) * 0.5);
    if (line) {
      line.glyphs.push(c); line.left = Math.min(line.left, c.left); line.right = Math.max(line.right, c.right);
      line.top = Math.min(line.top, c.top); line.bottom = Math.max(line.bottom, c.bottom);
    } else lines.push({ center, height: c.height, left: c.left, right: c.right, top: c.top, bottom: c.bottom, glyphs: [c] });
  }
  const textLines = lines.filter(l => l.glyphs.length >= 2);
  // If geometry is inconclusive, preserve the original threshold mask. This
  // keeps isolated characters and unusual fonts instead of silently erasing them.
  const kept = new Set(textLines.length ? components.filter(c => textLines.some(l => {
    if (c.left < l.left - l.height * 0.3 || c.right > l.right + l.height * 0.75) return false;
    const center = (c.top + c.bottom) / 2;
    if (center >= l.top && center <= l.bottom + l.height * 0.1 && c.height <= l.height * 1.9) return true;
    // Dots/accents above lowercase stems; do not retain detached scenery below.
    return c.bottom < l.top && l.top - c.bottom <= l.height * 0.35 && c.height < l.height * 0.5 && l.glyphs.some(g => c.left <= g.right && c.right >= g.left);
  })).map(c => c.id) : components.map(c => c.id));
  const selected = components.filter(c => kept.has(c.id));
  const bounds = selected.reduce((b, c) => ({ left: Math.min(b.left, c.left), top: Math.min(b.top, c.top), right: Math.max(b.right, c.right), bottom: Math.max(b.bottom, c.bottom) }), { left: width, top: height, right: -1, bottom: -1 });
  const { left, top, right, bottom } = selected.length ? bounds : { left: 0, top: 0, right: width - 1, bottom: height - 1 };
  const border = 10;
  const png = new PNG({ width: right - left + 1 + border * 2, height: bottom - top + 1 + border * 2 });
  png.data.fill(255);
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
    if (!kept.has(labels[y * width + x])) continue;
    const o = ((y - top + border) * png.width + x - left + border) * 4;
    png.data[o] = png.data[o + 1] = png.data[o + 2] = 0;
  }
  // Normalize detected letter height, not the full screenshot dimensions. Large
  // screen fonts can be as troublesome to the LSTM as very small characters.
  const lineHeight = textLines.length ? Math.max(...textLines.map(l => l.height)) : 30;
  const scale = lineHeight >= 24 && lineHeight <= 36 ? 1 : Math.max(0.5, Math.min(3, 30 / lineHeight));
  if (scale === 1) return PNG.sync.write(png);
  const resized = new PNG({ width: Math.max(1, Math.round(png.width * scale)), height: Math.max(1, Math.round(png.height * scale)) });
  for (let y = 0; y < resized.height; y++) for (let x = 0; x < resized.width; x++) {
    const sx = Math.min(png.width - 1, x / scale), sy = Math.min(png.height - 1, y / scale);
    const ix = Math.floor(sx), iy = Math.floor(sy), fx = sx - ix, fy = sy - iy;
    const value = (px, py) => png.data[(Math.min(png.height - 1, py) * png.width + Math.min(png.width - 1, px)) * 4];
    const shade = Math.round(value(ix, iy) * (1 - fx) * (1 - fy) + value(ix + 1, iy) * fx * (1 - fy) + value(ix, iy + 1) * (1 - fx) * fy + value(ix + 1, iy + 1) * fx * fy);
    const o = (y * resized.width + x) * 4;
    resized.data[o] = resized.data[o + 1] = resized.data[o + 2] = shade; resized.data[o + 3] = 255;
  }
  return PNG.sync.write(resized);
}
module.exports = { prepareSubtitleImage };

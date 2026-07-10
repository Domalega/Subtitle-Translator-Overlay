'use strict';

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function calculateCropBounds({ imageSize, displaySize, ocrArea }) {
  const imageWidth = Math.max(1, Math.round(finite(imageSize?.width, 1)));
  const imageHeight = Math.max(1, Math.round(finite(imageSize?.height, 1)));
  const displayWidth = Math.max(1, finite(displaySize?.width, imageWidth));
  const displayHeight = Math.max(1, finite(displaySize?.height, imageHeight));
  const scaleX = imageWidth / displayWidth;
  const scaleY = imageHeight / displayHeight;
  const left = Math.round(finite(ocrArea?.x) * scaleX);
  const top = Math.round(finite(ocrArea?.y) * scaleY);
  const right = Math.round((finite(ocrArea?.x) + Math.max(0, finite(ocrArea?.width))) * scaleX);
  const bottom = Math.round((finite(ocrArea?.y) + Math.max(0, finite(ocrArea?.height))) * scaleY);
  const x = Math.max(0, Math.min(imageWidth - 1, left));
  const y = Math.max(0, Math.min(imageHeight - 1, top));
  const clampedRight = Math.max(x + 1, Math.min(imageWidth, right));
  const clampedBottom = Math.max(y + 1, Math.min(imageHeight, bottom));
  return { x, y, width: clampedRight - x, height: clampedBottom - y };
}

module.exports = { calculateCropBounds };

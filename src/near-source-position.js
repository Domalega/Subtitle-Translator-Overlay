function round(value) { return Math.round(Number(value) || 0); }

function calculateNearSourceBounds({ anchorBounds, overlaySize, workArea, placement = 'auto', verticalOffset = 10 }) {
  const area = workArea;
  const anchor = anchorBounds;
  const offset = Math.max(0, round(verticalOffset));
  const width = Math.max(1, Math.min(round(overlaySize.width), round(area.width)));
  const height = Math.max(1, Math.min(round(overlaySize.height), round(area.height)));
  const belowY = round(anchor.y + anchor.height + offset);
  const aboveY = round(anchor.y - offset - height);
  const belowSpace = round(area.y + area.height - belowY);
  const aboveSpace = round(anchor.y - offset - area.y);
  let useBelow = placement === 'below' || (placement === 'auto' && (belowSpace >= height || belowSpace >= aboveSpace));
  if (placement === 'above') useBelow = false;
  let y = useBelow ? belowY : aboveY;
  if (useBelow && y + height > area.y + area.height && aboveSpace >= height) y = aboveY;
  if (!useBelow && y < area.y && belowSpace >= height) y = belowY;
  y = Math.max(area.y, Math.min(y, area.y + area.height - height));
  const x = Math.max(area.x, Math.min(round(anchor.x + (anchor.width - width) / 2), area.x + area.width - width));
  return { x: round(x), y: round(y), width, height };
}

module.exports = { calculateNearSourceBounds };

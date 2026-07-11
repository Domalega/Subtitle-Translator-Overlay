'use strict';

function getActiveOcrArea({ manualArea, manualAnchorBoundsDip, automaticArea, automaticAnchorBoundsDip, automaticDisplayId } = {}) {
  if (automaticArea) return { source: 'automatic', area: automaticArea, anchorBoundsDip: automaticAnchorBoundsDip, displayId: automaticDisplayId || null };
  if (manualArea) return { source: 'manual', area: manualArea, anchorBoundsDip: manualAnchorBoundsDip, displayId: null };
  return null;
}

function physicalAreaToDip(area, display) {
  const scale = display?.scaleFactor || 1;
  return { x: display.bounds.x + area.x / scale, y: display.bounds.y + area.y / scale, width: area.width / scale, height: area.height / scale };
}

module.exports = { getActiveOcrArea, physicalAreaToDip };

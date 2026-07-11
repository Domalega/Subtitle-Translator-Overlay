'use strict';

const STATES = Object.freeze({ IDLE: 'idle', ACQUIRING: 'acquiring', LOCKED: 'locked', POSSIBLE_LOST: 'possible-lost', LOST: 'lost', STOPPED: 'stopped' });

function finiteArea(area) {
  return area && [area.x, area.y, area.width, area.height].every(Number.isFinite) && area.width > 0 && area.height > 0;
}

function areaIoU(left, right) {
  if (!finiteArea(left) || !finiteArea(right)) return 0;
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const width = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - x);
  const height = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - y);
  return width * height / (left.width * left.height + right.width * right.height - width * height);
}

function isSimilarArea(left, right, minimumIoU = 0.6) {
  return areaIoU(left, right) >= minimumIoU;
}

function clampAreaToScreen(area, screen) {
  const width = Math.max(1, Math.round(screen?.width || 1));
  const height = Math.max(1, Math.round(screen?.height || 1));
  const x = Math.max(0, Math.min(width - 1, Math.round(area?.x || 0)));
  const y = Math.max(0, Math.min(height - 1, Math.round(area?.y || 0)));
  return { x, y, width: Math.max(1, Math.min(width - x, Math.round(area?.width || 1))), height: Math.max(1, Math.min(height - y, Math.round(area?.height || 1))) };
}

function stabilizeArea(previous, next, screen, { tolerance = 4, padding = 8 } = {}) {
  const candidate = clampAreaToScreen({ x: next.x - padding, y: next.y - padding, width: next.width + padding * 2, height: next.height + padding * 2 }, screen);
  if (!finiteArea(previous)) return candidate;
  if (Math.abs(previous.x - candidate.x) <= tolerance && Math.abs(previous.y - candidate.y) <= tolerance && Math.abs(previous.width - candidate.width) <= tolerance && Math.abs(previous.height - candidate.height) <= tolerance) return previous;
  return candidate;
}

class SubtitleAreaTracker {
  constructor({ now = () => performance.now(), possibleLostMs = 2500, lostMs = 6000 } = {}) {
    this.now = now;
    this.possibleLostMs = possibleLostMs;
    this.lostMs = lostMs;
    this.reset();
  }

  reset() { this.state = STATES.IDLE; this.emptySince = null; this.lockedAt = null; }
  snapshot() { return { state: this.state, emptyDurationMs: this.emptySince === null ? 0 : Math.max(0, this.now() - this.emptySince) }; }
  transition(state, action) { this.state = state; return { state, action, emptyDurationMs: this.snapshot().emptyDurationMs }; }
  dispatch(event) {
    const now = this.now();
    if (event === 'manualStop') { this.emptySince = null; return this.transition(STATES.STOPPED, 'stopTracking'); }
    if (event === 'screenChanged') { this.emptySince = now; return this.transition(STATES.LOST, 'startGlobalSearch'); }
    if (event === 'candidateFound') { this.emptySince = null; this.lockedAt = now; return this.transition(STATES.LOCKED, 'replaceArea'); }
    if (event === 'candidateNotFound') return this.transition(this.state === STATES.ACQUIRING ? STATES.LOST : this.state, this.state === STATES.ACQUIRING ? 'startGlobalSearch' : 'keepArea');
    if (event === 'timeout') return this.transition(this.state === STATES.LOST ? STATES.LOST : this.state, this.state === STATES.LOST ? 'startGlobalSearch' : 'keepArea');
    if (event === 'textDetected' || event === 'frameChanged') { this.emptySince = null; return this.transition(STATES.LOCKED, 'keepArea'); }
    if (event === 'emptyFrame') {
      if (this.state !== STATES.LOCKED && this.state !== STATES.POSSIBLE_LOST) return this.transition(this.state, 'keepArea');
      if (this.emptySince === null) this.emptySince = now;
      const emptyDurationMs = now - this.emptySince;
      if (emptyDurationMs >= this.lostMs) return this.transition(STATES.LOST, 'markLost');
      if (emptyDurationMs >= this.possibleLostMs) return this.transition(STATES.POSSIBLE_LOST, 'validateArea');
      return this.transition(STATES.LOCKED, 'keepArea');
    }
    return this.transition(this.state, 'keepArea');
  }

  acquire() { this.emptySince = null; return this.transition(STATES.ACQUIRING, 'startGlobalSearch'); }
}

module.exports = { STATES, SubtitleAreaTracker, areaIoU, isSimilarArea, stabilizeArea, clampAreaToScreen };

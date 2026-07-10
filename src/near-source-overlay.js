const card = document.getElementById('card');
const translation = document.getElementById('translation');
let lastMeasured = '';

function applySettings(settings = {}) {
  const root = document.documentElement.style;
  if (Number.isFinite(Number(settings.nearSourceFontSize))) root.setProperty('--font-size', `${Number(settings.nearSourceFontSize)}px`);
  if (Number.isFinite(Number(settings.nearSourceBackgroundOpacity))) root.setProperty('--opacity', String(settings.nearSourceBackgroundOpacity));
  if (Number.isFinite(Number(settings.nearSourceMaxWidth))) root.setProperty('--max-width', `${Number(settings.nearSourceMaxWidth)}px`);
  if (Number.isFinite(Number(settings.nearSourceMaxLines))) root.setProperty('--max-lines', String(settings.nearSourceMaxLines));
}

function measure() {
  requestAnimationFrame(() => {
    const rect = card.getBoundingClientRect();
    const size = { width: Math.ceil(rect.width), height: Math.ceil(rect.height) };
    const key = `${size.width}x${size.height}`;
    if (key === lastMeasured || !size.width || !size.height) return;
    lastMeasured = key;
    window.overlayApi.nearSourceOverlayMeasured(size);
  });
}

window.overlayApi.onNearSourceOverlayContent((payload) => {
  translation.textContent = typeof payload?.text === 'string' ? payload.text : '';
  measure();
});
window.overlayApi.onNearSourceOverlaySettings((settings) => { applySettings(settings); measure(); });
new ResizeObserver(measure).observe(card);

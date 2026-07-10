const card = document.getElementById('card');
const translation = document.getElementById('translation');

function applySettings(settings = {}) {
  const root = document.documentElement.style;
  if (Number.isFinite(Number(settings.nearSourceFontSize))) root.setProperty('--font-size', `${Number(settings.nearSourceFontSize)}px`);
  if (Number.isFinite(Number(settings.nearSourceBackgroundOpacity))) root.setProperty('--opacity', String(settings.nearSourceBackgroundOpacity));
  if (Number.isFinite(Number(settings.nearSourceMaxWidth))) root.setProperty('--max-width', `${Number(settings.nearSourceMaxWidth)}px`);
  if (Number.isFinite(Number(settings.nearSourceMaxLines))) root.setProperty('--max-lines', String(settings.nearSourceMaxLines));
}

window.overlayApi.onNearSourceOverlayContent((payload) => {
  translation.textContent = typeof payload?.text === 'string' ? payload.text : '';
});
window.overlayApi.onNearSourceOverlaySettings(applySettings);

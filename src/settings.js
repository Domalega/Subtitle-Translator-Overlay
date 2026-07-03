const selectOcrAreaButton = document.getElementById('selectOcrArea');
const themeSelect = document.getElementById('themeSelect');
const fontScaleInput = document.getElementById('fontScale');
const windowWidthInput = document.getElementById('windowWidth');
const windowHeightInput = document.getElementById('windowHeight');
const statusElement = document.getElementById('status');

selectOcrAreaButton.addEventListener('click', () => {
  statusElement.textContent = 'Drag a rectangle around the subtitles.';
  window.overlayApi.selectOcrArea();
});

themeSelect.addEventListener('change', () => {
  window.overlayApi.setUiSetting('theme', themeSelect.value);
});

fontScaleInput.addEventListener('input', () => {
  window.overlayApi.setUiSetting('fontScale', fontScaleInput.value);
});

function applyWindowSize() {
  window.overlayApi.setWindowSize(Number(windowWidthInput.value), Number(windowHeightInput.value));
}

windowWidthInput.addEventListener('input', applyWindowSize);
windowHeightInput.addEventListener('input', applyWindowSize);

window.overlayApi.onOcrAreaChanged((area) => {
  statusElement.textContent = `OCR area selected: ${Math.round(area.width)}x${Math.round(area.height)}`;
});

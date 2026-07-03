const selectOcrAreaButton = document.getElementById('selectOcrArea');
const closeWindowButton = document.getElementById('closeWindow');
const themeSelect = document.getElementById('themeSelect');
const fontScaleInput = document.getElementById('fontScale');
const windowWidthInput = document.getElementById('windowWidth');
const windowHeightInput = document.getElementById('windowHeight');
const statusElement = document.getElementById('status');

function applyToolTheme(theme) {
  document.body.dataset.theme = theme;
  localStorage.setItem('subtitle-overlay-theme', theme);
}

applyToolTheme(localStorage.getItem('subtitle-overlay-theme') || 'green');
themeSelect.value = localStorage.getItem('subtitle-overlay-theme') || 'green';

closeWindowButton.addEventListener('click', () => window.overlayApi.closeCurrentWindow());

selectOcrAreaButton.addEventListener('click', () => {
  statusElement.textContent = 'Drag a rectangle around the subtitles.';
  window.overlayApi.selectOcrArea();
});

themeSelect.addEventListener('change', () => {
  applyToolTheme(themeSelect.value);
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

// No status message for OCR area selection

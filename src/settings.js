const selectOcrAreaButton = document.getElementById('selectOcrArea');
const closeWindowButton = document.getElementById('closeWindow');
const themeSelect = document.getElementById('themeSelect');
const fontScaleInput = document.getElementById('fontScale');
const windowWidthInput = document.getElementById('windowWidth');
const windowHeightInput = document.getElementById('windowHeight');
const statusElement = document.getElementById('status');

document.body.dataset.theme = localStorage.getItem('subtitle-overlay-theme') || 'green';
themeSelect.value = localStorage.getItem('subtitle-overlay-theme') || 'green';

window.overlayApi.onApplyUiSetting(({ key, value }) => {
  if (key === 'theme') {
    document.body.dataset.theme = value;
    localStorage.setItem('subtitle-overlay-theme', value);
  }
});

closeWindowButton.addEventListener('click', () => window.overlayApi.closeCurrentWindow());

selectOcrAreaButton.addEventListener('click', () => {
  window.overlayApi.selectOcrArea();
});

fontScaleInput.addEventListener('input', () => {
  window.overlayApi.setUiSetting('fontScale', fontScaleInput.value);
});

function applyWindowSize() {
  window.overlayApi.setWindowSize(Number(windowWidthInput.value), Number(windowHeightInput.value));
}

windowWidthInput.addEventListener('input', applyWindowSize);
windowHeightInput.addEventListener('input', applyWindowSize);

themeSelect.addEventListener('change', () => {
  window.overlayApi.setUiSetting('theme', themeSelect.value);
});
const selectOcrAreaButton = document.getElementById('selectOcrArea');
const closeWindowButton = document.getElementById('closeWindow');
const themeSelect = document.getElementById('themeSelect');
const fontScaleInput = document.getElementById('fontScale');
const windowWidthInput = document.getElementById('windowWidth');
const windowHeightInput = document.getElementById('windowHeight');
const fontScaleValue = document.getElementById('fontScaleValue');
const windowWidthValue = document.getElementById('windowWidthValue');
const windowHeightValue = document.getElementById('windowHeightValue');
const gameOcrMode = document.getElementById('gameOcrMode');
const gameOcrInterval = document.getElementById('gameOcrInterval');
const gameCardWidth = document.getElementById('gameCardWidth');
const gameCardWidthValue = document.getElementById('gameCardWidthValue');
const gameCardFontSize = document.getElementById('gameCardFontSize');
const gameCardFontSizeValue = document.getElementById('gameCardFontSizeValue');
const gameCardOpacity = document.getElementById('gameCardOpacity');
const gameCardOpacityValue = document.getElementById('gameCardOpacityValue');
const resetButton = document.getElementById('resetDefaults');
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
  fontScaleValue.textContent = `${fontScaleInput.value}%`;
  window.overlayApi.setUiSetting('fontScale', fontScaleInput.value);
});

windowWidthInput.addEventListener('input', () => {
  windowWidthValue.textContent = `${windowWidthInput.value} px`;
  window.overlayApi.setWindowSize(Number(windowWidthInput.value), Number(windowHeightInput.value));
});

windowHeightInput.addEventListener('input', () => {
  windowHeightValue.textContent = `${windowHeightInput.value} px`;
  window.overlayApi.setWindowSize(Number(windowWidthInput.value), Number(windowHeightInput.value));
});

themeSelect.addEventListener('change', () => {
  window.overlayApi.setUiSetting('theme', themeSelect.value);
});

gameOcrMode.addEventListener('change', () => {
  window.overlayApi.setGameSetting('mode', gameOcrMode.value);
});

gameOcrInterval.addEventListener('change', () => {
  window.overlayApi.setGameSetting('liveInterval', Number(gameOcrInterval.value));
});

gameCardWidth.addEventListener('input', () => {
  gameCardWidthValue.textContent = `${gameCardWidth.value} px`;
  window.overlayApi.setGameSetting('cardWidth', Number(gameCardWidth.value));
});

gameCardFontSize.addEventListener('input', () => {
  gameCardFontSizeValue.textContent = `${gameCardFontSize.value} px`;
  window.overlayApi.setGameSetting('cardFontSize', Number(gameCardFontSize.value));
});

gameCardOpacity.addEventListener('input', () => {
  gameCardOpacityValue.textContent = `${gameCardOpacity.value}%`;
  window.overlayApi.setGameSetting('cardOpacity', Number(gameCardOpacity.value) / 100);
});

async function loadGameSettings() {
  const settings = await window.overlayApi.getGameSettings();
  gameOcrMode.value = settings.mode || 'hotkey';
  gameOcrInterval.value = String(settings.liveInterval || 5);
  gameCardWidth.value = settings.cardWidth || 480;
  gameCardFontSize.value = settings.cardFontSize || 14;
  gameCardOpacity.value = Math.round((settings.cardOpacity || 1) * 100);
  gameCardWidthValue.textContent = `${gameCardWidth.value} px`;
  gameCardFontSizeValue.textContent = `${gameCardFontSize.value} px`;
  gameCardOpacityValue.textContent = `${gameCardOpacity.value}%`;
}

loadGameSettings();

resetButton.addEventListener('click', () => {
  const defaults = { fontScale: 100, windowWidth: 980, windowHeight: 360, theme: 'green' };
  fontScaleInput.value = defaults.fontScale;
  windowWidthInput.value = defaults.windowWidth;
  windowHeightInput.value = defaults.windowHeight;
  themeSelect.value = defaults.theme;
  fontScaleValue.textContent = `${defaults.fontScale}%`;
  windowWidthValue.textContent = `${defaults.windowWidth} px`;
  windowHeightValue.textContent = `${defaults.windowHeight} px`;
  window.overlayApi.setUiSetting('fontScale', defaults.fontScale);
  window.overlayApi.setWindowSize(defaults.windowWidth, defaults.windowHeight);
  window.overlayApi.setUiSetting('theme', defaults.theme);
  statusElement.textContent = 'Settings reset to defaults';
  statusElement.hidden = false;
  setTimeout(() => { statusElement.hidden = true; }, 2000);
});

fontScaleValue.textContent = `${fontScaleInput.value}%`;
windowWidthValue.textContent = `${windowWidthInput.value} px`;
windowHeightValue.textContent = `${windowHeightInput.value} px`;
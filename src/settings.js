const selectOcrAreaButton = document.getElementById('selectOcrArea');
const closeWindowButton = document.getElementById('closeWindow');
const themeSelect = document.getElementById('themeSelect');
const fontSelect = document.getElementById('fontSelect');
const fontScaleInput = document.getElementById('fontScale');
const windowWidthInput = document.getElementById('windowWidth');
const windowHeightInput = document.getElementById('windowHeight');
const fontScaleValue = document.getElementById('fontScaleValue');
const windowWidthValue = document.getElementById('windowWidthValue');
const windowHeightValue = document.getElementById('windowHeightValue');
const gameOcrMode = document.getElementById('gameOcrMode');
const gameOcrInterval = document.getElementById('gameOcrInterval');
const gameOcrOverlaySettings = document.getElementById('gameOcrOverlaySettings');
const gameCardWidth = document.getElementById('gameCardWidth');
const gameCardWidthValue = document.getElementById('gameCardWidthValue');
const gameCardFontSize = document.getElementById('gameCardFontSize');
const gameCardFontSizeValue = document.getElementById('gameCardFontSizeValue');
const gameCardOpacity = document.getElementById('gameCardOpacity');
const gameCardOpacityValue = document.getElementById('gameCardOpacityValue');
const gameHotkey = document.getElementById('gameHotkey');
const deleteConfirmToggle = document.getElementById('deleteConfirmToggle');
const contextCountSelect = document.getElementById('contextCountSelect');
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
selectOcrAreaButton.addEventListener('click', () => window.overlayApi.selectOcrArea());

fontScaleInput.addEventListener('input', () => {
  fontScaleValue.textContent = `${fontScaleInput.value}%`;
  window.overlayApi.setUiSetting('fontScale', fontScaleInput.value);
});
windowWidthInput.addEventListener('input', () => {
  windowWidthValue.textContent = `${windowWidthInput.value} px`;
  window.overlayApi.setWindowSize(Number(windowWidthInput.value), Number(windowHeightInput.value));
  window.overlayApi.setUiSetting('windowWidth', windowWidthInput.value);
});
windowHeightInput.addEventListener('input', () => {
  windowHeightValue.textContent = `${windowHeightInput.value} px`;
  window.overlayApi.setWindowSize(Number(windowWidthInput.value), Number(windowHeightInput.value));
  window.overlayApi.setUiSetting('windowHeight', windowHeightInput.value);
});
themeSelect.addEventListener('change', () => window.overlayApi.setUiSetting('theme', themeSelect.value));
fontSelect.addEventListener('change', () => window.overlayApi.setUiSetting('font', fontSelect.value));

gameOcrMode.addEventListener('change', () => {
  window.overlayApi.setGameSetting('mode', gameOcrMode.value);
  gameOcrOverlaySettings.hidden = gameOcrMode.value !== 'live';
});
gameOcrInterval.addEventListener('change', () => window.overlayApi.setGameSetting('liveInterval', Number(gameOcrInterval.value)));
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

gameHotkey.addEventListener('change', async () => {
  const acc = gameHotkey.value.trim();
  if (!acc) return;
  const ok = await window.overlayApi.setGameHotkey(acc);
  if (!ok) {
    statusElement.textContent = 'Invalid hotkey';
    statusElement.hidden = false;
    setTimeout(() => { statusElement.hidden = true; }, 2000);
  }
});
deleteConfirmToggle.addEventListener('change', () => window.overlayApi.setUiSetting('deleteConfirm', deleteConfirmToggle.checked));
contextCountSelect.addEventListener('change', () => window.overlayApi.setUiSetting('contextCount', Number(contextCountSelect.value)));

async function loadGameSettings() {
  try {
    const settings = await window.overlayApi.getGameSettings();
    gameOcrMode.value = settings.mode || 'hotkey';
    gameOcrInterval.value = String(settings.liveInterval || 5);
    gameCardWidth.value = settings.cardWidth || 480;
    gameCardFontSize.value = settings.cardFontSize || 14;
    gameCardOpacity.value = Math.round((settings.cardOpacity || 1) * 100);
    gameOcrOverlaySettings.hidden = settings.mode !== 'live';
  } catch (_) {
    gameOcrMode.value = 'hotkey';
    gameOcrInterval.value = '5';
    gameCardWidth.value = 480;
    gameCardFontSize.value = 14;
    gameCardOpacity.value = 100;
  }
  gameCardWidthValue.textContent = `${gameCardWidth.value} px`;
  gameCardFontSizeValue.textContent = `${gameCardFontSize.value} px`;
  gameCardOpacityValue.textContent = `${gameCardOpacity.value}%`;
}

async function loadUiSettings() {
  try {
    const s = await window.overlayApi.getUiSettings();
    fontSelect.value = s.font || 'system';
    fontScaleInput.value = s.fontScale || 100;
    windowWidthInput.value = s.windowWidth || 980;
    windowHeightInput.value = s.windowHeight || 360;
    gameHotkey.value = s.hotkey || 'CommandOrControl+Shift+T';
    deleteConfirmToggle.checked = s.deleteConfirm !== false;
    contextCountSelect.value = String(s.contextCount || 5);
  } catch (_) {
    fontSelect.value = 'system';
    deleteConfirmToggle.checked = true;
    contextCountSelect.value = '5';
  }
  fontScaleValue.textContent = `${fontScaleInput.value}%`;
  windowWidthValue.textContent = `${windowWidthInput.value} px`;
  windowHeightValue.textContent = `${windowHeightInput.value} px`;
}

loadGameSettings();
loadUiSettings();

resetButton.addEventListener('click', () => {
  const defaults = { fontScale: 100, windowWidth: 980, windowHeight: 360, theme: 'green' };
  fontSelect.value = 'system';
  fontScaleInput.value = defaults.fontScale;
  windowWidthInput.value = defaults.windowWidth;
  windowHeightInput.value = defaults.windowHeight;
  themeSelect.value = defaults.theme;
  gameHotkey.value = 'CommandOrControl+Shift+T';
  deleteConfirmToggle.checked = true;
  contextCountSelect.value = '5';
  fontScaleValue.textContent = `${fontScaleInput.value}%`;
  windowWidthValue.textContent = `${windowWidthInput.value} px`;
  windowHeightValue.textContent = `${windowHeightInput.value} px`;
  window.overlayApi.setUiSetting('fontScale', defaults.fontScale);
  window.overlayApi.setWindowSize(defaults.windowWidth, defaults.windowHeight);
  window.overlayApi.setUiSetting('theme', defaults.theme);
  window.overlayApi.setUiSetting('font', 'system');
  window.overlayApi.setUiSetting('deleteConfirm', true);
  window.overlayApi.setUiSetting('contextCount', 5);
  window.overlayApi.setGameHotkey('CommandOrControl+Shift+T');
  statusElement.textContent = 'Settings reset to defaults';
  statusElement.hidden = false;
  setTimeout(() => { statusElement.hidden = true; }, 2000);
});

document.querySelectorAll('.accordionHeader').forEach((header) => {
  const section = header.dataset.section;
  const body = document.getElementById(`section${section.charAt(0).toUpperCase() + section.slice(1)}`);
  const isOpen = section === 'appearance';
  if (isOpen) { header.classList.add('open'); body.classList.add('open'); }

  header.addEventListener('click', () => {
    const open = body.classList.toggle('open');
    header.classList.toggle('open', open);
    header.querySelector('.accordionChevron').textContent = open ? '▾' : '▸';
  });
});
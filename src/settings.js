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
const gameHotkey = document.getElementById('gameHotkey');
const deleteConfirmToggle = document.getElementById('deleteConfirmToggle');
const contextCountSelect = document.getElementById('contextCountSelect');
const resetButton = document.getElementById('resetDefaults');
const statusElement = document.getElementById('status');

let uiSettingSaveQueue = Promise.resolve();

function setUiSettingQueued(key, value) {
  uiSettingSaveQueue = uiSettingSaveQueue.then(() => window.overlayApi.setUiSetting(key, value));
  return uiSettingSaveQueue;
}

function setStatus(message) {
  statusElement.textContent = message;
  statusElement.hidden = false;
  setTimeout(() => { statusElement.hidden = true; }, 2000);
}

document.body.dataset.theme = 'green';
themeSelect.value = 'green';

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
  setUiSettingQueued('fontScale', Number(fontScaleInput.value));
});
windowWidthInput.addEventListener('input', () => {
  windowWidthValue.textContent = `${windowWidthInput.value} px`;
  window.overlayApi.setWindowSize(Number(windowWidthInput.value), Number(windowHeightInput.value));
  setUiSettingQueued('windowWidth', Number(windowWidthInput.value));
});
windowHeightInput.addEventListener('input', () => {
  windowHeightValue.textContent = `${windowHeightInput.value} px`;
  window.overlayApi.setWindowSize(Number(windowWidthInput.value), Number(windowHeightInput.value));
  setUiSettingQueued('windowHeight', Number(windowHeightInput.value));
});
themeSelect.addEventListener('change', () => setUiSettingQueued('theme', themeSelect.value));
fontSelect.addEventListener('change', () => setUiSettingQueued('font', fontSelect.value));

gameHotkey.addEventListener('change', async () => {
  const acc = gameHotkey.value.trim();
  if (!acc) return;
  const ok = await window.overlayApi.setGameHotkey(acc);
  if (!ok) {
    setStatus('Invalid hotkey');
  }
});
deleteConfirmToggle.addEventListener('change', () => setUiSettingQueued('deleteConfirm', deleteConfirmToggle.checked));
contextCountSelect.addEventListener('change', () => setUiSettingQueued('contextCount', Number(contextCountSelect.value)));

async function loadUiSettings() {
  try {
    const s = await window.overlayApi.getUiSettings();
    themeSelect.value = s.theme || 'green';
    document.body.dataset.theme = themeSelect.value;
    localStorage.setItem('subtitle-overlay-theme', themeSelect.value);
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

loadUiSettings();

resetButton.addEventListener('click', async () => {
  const defaults = {
    theme: 'green',
    font: 'system',
    fontScale: 100,
    windowWidth: 980,
    windowHeight: 360,
    hotkey: 'CommandOrControl+Shift+T',
    deleteConfirm: true,
    contextCount: 5
  };
  fontSelect.value = defaults.font;
  fontScaleInput.value = defaults.fontScale;
  windowWidthInput.value = defaults.windowWidth;
  windowHeightInput.value = defaults.windowHeight;
  themeSelect.value = defaults.theme;
  document.body.dataset.theme = defaults.theme;
  gameHotkey.value = defaults.hotkey;
  deleteConfirmToggle.checked = defaults.deleteConfirm;
  contextCountSelect.value = String(defaults.contextCount);
  fontScaleValue.textContent = `${fontScaleInput.value}%`;
  windowWidthValue.textContent = `${windowWidthInput.value} px`;
  windowHeightValue.textContent = `${windowHeightInput.value} px`;
  window.overlayApi.setWindowSize(defaults.windowWidth, defaults.windowHeight);
  await setUiSettingQueued('theme', defaults.theme);
  await setUiSettingQueued('font', defaults.font);
  await setUiSettingQueued('fontScale', defaults.fontScale);
  await setUiSettingQueued('windowWidth', defaults.windowWidth);
  await setUiSettingQueued('windowHeight', defaults.windowHeight);
  await setUiSettingQueued('deleteConfirm', defaults.deleteConfirm);
  await setUiSettingQueued('contextCount', defaults.contextCount);
  await window.overlayApi.setGameHotkey(defaults.hotkey);
  setStatus('Settings reset to defaults');
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

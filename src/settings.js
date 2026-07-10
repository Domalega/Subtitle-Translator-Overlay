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
const displayMode = document.getElementById('displayMode');
const nearSourceSettings = document.getElementById('nearSourceSettings');
const nearSourcePlacement = document.getElementById('nearSourcePlacement');
const nearSourceVerticalOffset = document.getElementById('nearSourceVerticalOffset');
const nearSourceFontSize = document.getElementById('nearSourceFontSize');
const nearSourceBackgroundOpacity = document.getElementById('nearSourceBackgroundOpacity');
const nearSourceMaxWidth = document.getElementById('nearSourceMaxWidth');
const nearSourceMaxLines = document.getElementById('nearSourceMaxLines');

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

function updateNearSourceVisibility() { nearSourceSettings.hidden = displayMode.value !== 'near-source'; }
function updateNearSourceLabels() {
  document.getElementById('nearSourceVerticalOffsetValue').textContent = `${nearSourceVerticalOffset.value} px`;
  document.getElementById('nearSourceFontSizeValue').textContent = `${nearSourceFontSize.value} px`;
  document.getElementById('nearSourceBackgroundOpacityValue').textContent = `${nearSourceBackgroundOpacity.value}%`;
  document.getElementById('nearSourceMaxWidthValue').textContent = `${nearSourceMaxWidth.value} px`;
  document.getElementById('nearSourceMaxLinesValue').textContent = nearSourceMaxLines.value;
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
displayMode.addEventListener('change', () => {
  updateNearSourceVisibility();
  setUiSettingQueued('displayMode', displayMode.value);
  if (displayMode.value === 'near-source') setStatus('Near-source mode needs a selected OCR area. Select it again if no translation appears.');
});
nearSourcePlacement.addEventListener('change', () => setUiSettingQueued('nearSourcePlacement', nearSourcePlacement.value));
[[nearSourceVerticalOffset, 'nearSourceVerticalOffset', Number], [nearSourceFontSize, 'nearSourceFontSize', Number], [nearSourceBackgroundOpacity, 'nearSourceBackgroundOpacity', (value) => Number(value) / 100], [nearSourceMaxWidth, 'nearSourceMaxWidth', Number], [nearSourceMaxLines, 'nearSourceMaxLines', Number]].forEach(([input, key, convert]) => {
  input.addEventListener('input', () => { updateNearSourceLabels(); setUiSettingQueued(key, convert(input.value)); });
});

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
    displayMode.value = s.displayMode || 'panel';
    nearSourcePlacement.value = s.nearSourcePlacement || 'auto';
    nearSourceVerticalOffset.value = s.nearSourceVerticalOffset ?? 10;
    nearSourceFontSize.value = s.nearSourceFontSize ?? 24;
    nearSourceBackgroundOpacity.value = Math.round((s.nearSourceBackgroundOpacity ?? 0.7) * 100);
    nearSourceMaxWidth.value = s.nearSourceMaxWidth ?? 900;
    nearSourceMaxLines.value = s.nearSourceMaxLines ?? 3;
  } catch (_) {
    fontSelect.value = 'system';
    deleteConfirmToggle.checked = true;
    contextCountSelect.value = '5';
  }
  fontScaleValue.textContent = `${fontScaleInput.value}%`;
  windowWidthValue.textContent = `${windowWidthInput.value} px`;
  windowHeightValue.textContent = `${windowHeightInput.value} px`;
  updateNearSourceVisibility();
  updateNearSourceLabels();
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
    contextCount: 5,
    displayMode: 'panel', nearSourcePlacement: 'auto', nearSourceVerticalOffset: 10,
    nearSourceFontSize: 24, nearSourceBackgroundOpacity: 0.7, nearSourceMaxWidth: 900, nearSourceMaxLines: 3
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
  displayMode.value = defaults.displayMode;
  nearSourcePlacement.value = defaults.nearSourcePlacement;
  nearSourceVerticalOffset.value = defaults.nearSourceVerticalOffset;
  nearSourceFontSize.value = defaults.nearSourceFontSize;
  nearSourceBackgroundOpacity.value = defaults.nearSourceBackgroundOpacity * 100;
  nearSourceMaxWidth.value = defaults.nearSourceMaxWidth;
  nearSourceMaxLines.value = defaults.nearSourceMaxLines;
  fontScaleValue.textContent = `${fontScaleInput.value}%`;
  windowWidthValue.textContent = `${windowWidthInput.value} px`;
  windowHeightValue.textContent = `${windowHeightInput.value} px`;
  updateNearSourceVisibility();
  updateNearSourceLabels();
  window.overlayApi.setWindowSize(defaults.windowWidth, defaults.windowHeight);
  await setUiSettingQueued('theme', defaults.theme);
  await setUiSettingQueued('font', defaults.font);
  await setUiSettingQueued('fontScale', defaults.fontScale);
  await setUiSettingQueued('windowWidth', defaults.windowWidth);
  await setUiSettingQueued('windowHeight', defaults.windowHeight);
  await setUiSettingQueued('deleteConfirm', defaults.deleteConfirm);
  await setUiSettingQueued('contextCount', defaults.contextCount);
  await setUiSettingQueued('displayMode', defaults.displayMode);
  await setUiSettingQueued('nearSourcePlacement', defaults.nearSourcePlacement);
  await setUiSettingQueued('nearSourceVerticalOffset', defaults.nearSourceVerticalOffset);
  await setUiSettingQueued('nearSourceFontSize', defaults.nearSourceFontSize);
  await setUiSettingQueued('nearSourceBackgroundOpacity', defaults.nearSourceBackgroundOpacity);
  await setUiSettingQueued('nearSourceMaxWidth', defaults.nearSourceMaxWidth);
  await setUiSettingQueued('nearSourceMaxLines', defaults.nearSourceMaxLines);
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

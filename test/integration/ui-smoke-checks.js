'use strict';
async function runUiSmokeTest({ app, mainWindow, createToolWindow, createSelectionWindow, createCaptureWindow, createNearSourceWindow, getSelectionWindow, getCaptureWindow }) {
  let settingsWindow, dictionaryWindow;

  console.log('UI smoke test: loading windows.');
  const failures = [];
  const reportFailure = (message) => failures.push(message);
  const waitLoaded = window => new Promise((resolve, reject) => {
    if (!window.webContents.isLoading()) return resolve();
    window.webContents.once('did-finish-load', resolve);
    window.webContents.once('did-fail-load', (_event, code, description) => reject(new Error(description + ' (' + code + ')')));
  });
  const evaluate = async (window, source, name) => {
    let timer;
    try {
      await waitLoaded(window);
      return await Promise.race([
        window.webContents.executeJavaScript(source),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(name + ' evaluation timed out')), 5000); })
      ]);
    } finally { clearTimeout(timer); }
  };

  const watchWindow = (window, name) => {
    window.webContents.on('did-fail-load', (_event, code, description, url) => reportFailure(`${name} failed to load ${url}: ${code} ${description}`));
    window.webContents.on('render-process-gone', (_event, details) => reportFailure(`${name} renderer exited: ${details.reason}`));
    window.webContents.on('console-message', ({ level, message, lineNumber: line, sourceId }) => {
      if (level === 'error') reportFailure(`${name} console error at ${sourceId}:${line}: ${message}`);
    });
  };
  try {
    watchWindow(mainWindow, 'main');
    mainWindow.setPosition(-10000, -10000);
    mainWindow.showInactive();
    await new Promise((resolve) => setTimeout(resolve, 100));
    console.log('UI smoke test: main window checked.');
    settingsWindow = createToolWindow('renderer/settings/settings.html', 'Settings', 560, 760);
    dictionaryWindow = createToolWindow('renderer/dictionary/dictionary.html', 'Dictionary', 720, 620);
    // Off-screen windows receive native control layout without appearing to the user.
    for (const window of [settingsWindow, dictionaryWindow]) {
      window.setPosition(-10000, -10000);
      window.showInactive();
    }
    watchWindow(settingsWindow, 'settings');
    watchWindow(dictionaryWindow, 'dictionary');
    await new Promise((resolve) => setTimeout(resolve, 100));
    console.log('UI smoke test: tool windows checked.');

    const mainResult = await evaluate(mainWindow, `(() => {
      const ids = ['playPause', 'ocrOnce', 'settingsToggle', 'dictionaryOpen', 'gameModeToggle', 'findSubtitleArea', 'useDetectedSubtitleArea', 'stopAutoTracking', 'saveDetectionSample'];
      document.getElementById('playPause').click();
      document.getElementById('playPause').click();
      document.getElementById('ocrOnce').click();
      const tools = document.getElementById('developerTools');
      const hiddenBefore = tools.hidden;
      document.dispatchEvent(new CustomEvent('developer-mode-changed', { detail: { enabled: true } }));
      const visibleAfter = !tools.hidden;
      document.dispatchEvent(new CustomEvent('developer-mode-changed', { detail: { enabled: false } }));
      const hiddenAfter = tools.hidden;
      const developerInside = ['saveOcrSample', 'saveDetectionSample', 'openOcrDiagnostics', 'findSubtitleArea', 'useDetectedSubtitleArea', 'stopAutoTracking'].every((id) => tools.contains(document.getElementById(id)));
      const mainOutside = ['playPause', 'ocrOnce', 'settingsToggle', 'dictionaryOpen', 'gameModeToggle'].every((id) => !tools.contains(document.getElementById(id)));
      return { missing: ids.filter((id) => !document.getElementById(id)), preload: Boolean(window.overlayApi), enabled: ids.filter((id) => document.getElementById(id)?.disabled), hiddenBefore, visibleAfter, hiddenAfter, developerInside, mainOutside };
    })()`, 'main');
    if (mainResult.missing.length || !mainResult.preload || mainResult.enabled.length || !mainResult.hiddenBefore || !mainResult.visibleAfter || !mainResult.hiddenAfter || !mainResult.developerInside || !mainResult.mainOutside) reportFailure(`main controls failed: ${JSON.stringify(mainResult)}`);

    const settingsResult = await evaluate(settingsWindow, `new Promise((resolve) => setTimeout(() => {
      const displayMode = document.getElementById('displayMode');
      const headers = [...document.querySelectorAll('.accordionHeader')];
      const initiallyClosed = headers.every((header) => !header.classList.contains('open')) && [...document.querySelectorAll('.accordionBody')].every((body) => !body.classList.contains('open'));
      const displayHeader = document.querySelector('[data-section="display"]');
      displayHeader.click(); const displayOpens = displayHeader.classList.contains('open');
      displayHeader.click(); const displayCloses = !displayHeader.classList.contains('open');
      displayMode.value = 'both'; displayMode.dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelectorAll('.accordionHeader').forEach((header) => {
        if (!header.classList.contains('open')) header.click();
      });
      const checkboxes = [...document.querySelectorAll('input[type="checkbox"]')];
      const ranges = [...document.querySelectorAll('input[type="range"]')];
      const select = document.getElementById('themeSelect');
      select.value = 'blue'; select.dispatchEvent(new Event('change', { bubbles: true }));
      const visible = [...checkboxes, ...ranges].every((element) => getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden');
      const sized = [...checkboxes, ...ranges].every((element) => element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0);
      setTimeout(() => resolve({ checkboxes: checkboxes.length, ranges: ranges.length, visible, sized, theme: document.body.dataset.theme, enabled: !document.getElementById('resetDefaults').disabled, initiallyClosed, displayOpens, displayCloses }), 100);
    }, 50))`, 'settings');
    if (!settingsResult.checkboxes || !settingsResult.ranges || !settingsResult.visible || !settingsResult.sized || settingsResult.theme !== 'blue' || !settingsResult.enabled || !settingsResult.initiallyClosed || !settingsResult.displayOpens || !settingsResult.displayCloses) reportFailure(`Settings controls failed: ${JSON.stringify(settingsResult)}`);

    settingsWindow.close();
    await new Promise((resolve) => setTimeout(resolve, 50));
    settingsWindow = createToolWindow('renderer/settings/settings.html', 'Settings', 560, 760);
    settingsWindow.setPosition(-10000, -10000); settingsWindow.showInactive(); watchWindow(settingsWindow, 'settings reopened');
    const reopenedSettings = await evaluate(settingsWindow, `new Promise((resolve) => setTimeout(() => resolve({ closed: [...document.querySelectorAll('.accordionHeader')].every((header) => !header.classList.contains('open')) && [...document.querySelectorAll('.accordionBody')].every((body) => !body.classList.contains('open')), display: !document.querySelector('[data-section="display"]').classList.contains('open'), mode: document.getElementById('displayMode').value, theme: document.getElementById('themeSelect').value }), 100))`, 'settings reopened');
    if (!reopenedSettings.closed || !reopenedSettings.display || reopenedSettings.mode !== 'both' || reopenedSettings.theme !== 'blue') reportFailure(`Settings reopen failed: ${JSON.stringify(reopenedSettings)}`);

    const appliedTheme = await evaluate(mainWindow, `document.querySelector('.panel').dataset.theme`, 'main theme');
    if (appliedTheme !== 'blue') reportFailure(`main theme did not change: ${appliedTheme}`);

    const dictionaryResult = await evaluate(dictionaryWindow, `(() => {
      const list = document.getElementById('dictionaryList');
      const sort = document.getElementById('dictionarySort');
      sort.value = 'alpha-asc'; sort.dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('dictionaryNext').click();
      const rect = list?.getBoundingClientRect();
      return { list: Boolean(list), context: Boolean(document.getElementById('contextContent')), visible: rect?.width > 0 && rect?.height > 0, sort: sort.value };
    })()`, 'dictionary');
    if (!dictionaryResult.list || !dictionaryResult.context || !dictionaryResult.visible || dictionaryResult.sort !== 'alpha-asc') reportFailure(`Dictionary controls failed: ${JSON.stringify(dictionaryResult)}`);

    for (const create of [createSelectionWindow, createCaptureWindow]) create();
    const extraWindows = [getSelectionWindow(), getCaptureWindow(), createNearSourceWindow()];
    for (const window of extraWindows) {
      watchWindow(window, 'auxiliary');
      const result = await evaluate(window, '({ bridge: Boolean(window.overlayApi), body: Boolean(document.body), node: typeof require, scripts: document.scripts.length })', 'auxiliary');
      if (!result.bridge || !result.body || result.node !== 'undefined' || !result.scripts) reportFailure('Auxiliary window bridge/sandbox failed: ' + JSON.stringify(result));
    }
    const beforeWords = await evaluate(dictionaryWindow, 'window.overlayApi.dictionaryGet()', 'dictionary before');
    await evaluate(mainWindow, "Promise.all(['audit alpha', 'audit bravo', 'audit charlie'].map(english => window.overlayApi.dictionaryAdd({ english, russian: '' })))", 'dictionary concurrent add');
    const afterWords = await evaluate(dictionaryWindow, 'window.overlayApi.dictionaryGet()', 'dictionary after');
    if (afterWords.length !== beforeWords.length + 3) reportFailure('Concurrent IPC lost dictionary entries');
    const noArea = await evaluate(mainWindow, 'window.overlayApi.stopAutoTracking()', 'clear OCR area');
    if (!noArea.ok) reportFailure('Clearing OCR area failed');
    await evaluate(mainWindow, "document.getElementById('gameModeToggle').click()", 'enable Game mode');
    await evaluate(mainWindow, "new Promise(resolve => setTimeout(() => resolve(document.getElementById('playPause').disabled), 50))", 'Game mode buttons').then(disabled => { if (!disabled) reportFailure('Screen OCR remained enabled in Game mode'); });
    await evaluate(mainWindow, "document.getElementById('gameModeToggle').click()", 'disable Game mode');
  } catch (error) {
    reportFailure(error.stack || error.message);
  }
  setTimeout(() => {
    if (failures.length) {
      console.error(`UI smoke test failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
      app.exit(1);
    } else {
      console.log('UI smoke test passed.');
      app.exit(0);
    }
  }, 100);
}

module.exports = { runUiSmokeTest };

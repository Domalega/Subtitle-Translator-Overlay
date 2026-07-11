(() => {
  function initializeSubtitleAreaDetection() {
    const button = document.getElementById('findSubtitleArea');
    const status = document.getElementById('status');
    if (!button || !status || typeof window.overlayApi?.findSubtitleArea !== 'function') return;

    let searching = false;
    const setDeveloperMode = (enabled) => { button.hidden = !enabled; };

    document.addEventListener('developer-mode-changed', (event) => {
      setDeveloperMode(event.detail?.enabled === true);
    });

    button.addEventListener('click', async () => {
      if (searching) return;
      searching = true;
      button.disabled = true;
      status.textContent = 'Finding subtitle area...';
      try {
        const result = await window.overlayApi.findSubtitleArea();
        if (result?.error === 'DETECTION_BUSY') status.textContent = 'Finding subtitle area...';
        else if (!result?.found) status.textContent = 'No subtitle area found';
      } catch (_) {
        status.textContent = 'No subtitle area found';
      } finally {
        searching = false;
        button.disabled = false;
      }
    });
  }

  // This optional feature must never prevent the already initialized main UI from working.
  try {
    initializeSubtitleAreaDetection();
  } catch (error) {
    console.error('Subtitle area detection controls failed to initialize', error);
  }
})();

(() => {
  function initializeSubtitleAreaDetection() {
    const button = document.getElementById('findSubtitleArea');
    const useButton = document.getElementById('useDetectedSubtitleArea');
    const stopButton = document.getElementById('stopAutoTracking');
    const tools = document.getElementById('developerTools');
    const status = document.getElementById('developerStatus');
    const saveButton = document.getElementById('saveOcrSample');
    const saveDetectionButton = document.getElementById('saveDetectionSample');
    const openButton = document.getElementById('openOcrDiagnostics');
    if (!button || !useButton || !stopButton || !tools || !status || !saveButton || !saveDetectionButton || !openButton || typeof window.overlayApi?.findSubtitleArea !== 'function') return;

    let searching = false;
    const setDeveloperMode = (enabled) => { tools.hidden = !enabled; };

    document.addEventListener('developer-mode-changed', (event) => {
      setDeveloperMode(event.detail?.enabled === true);
    });
    window.overlayApi.getUiSettings().then((settings) => setDeveloperMode(settings?.developerMode === true)).catch(() => {});

    button.addEventListener('click', async () => {
      if (searching) return;
      searching = true;
      button.disabled = true;
      status.textContent = 'Finding subtitle area...';
      try {
        const result = await window.overlayApi.findSubtitleArea();
        if (result?.error === 'DETECTION_BUSY') status.textContent = 'Finding subtitle area...';
        else if (result?.found) status.textContent = 'Subtitle area found. Use detected area to lock it';
        else status.textContent = 'No subtitle area found';
      } catch (_) {
        status.textContent = 'No subtitle area found';
      } finally {
        searching = false;
        button.disabled = false;
      }
    });
    saveButton.addEventListener('click', async () => {
      const result = await window.overlayApi.saveOcrDiagnosticSample();
      status.textContent = result?.ok ? 'OCR sample saved' : result?.error === 'NO_COMPLETED_OCR_SAMPLE' ? 'No completed OCR sample' : 'Failed to save OCR sample';
    });
    saveDetectionButton.addEventListener('click', async () => {
      const result = await window.overlayApi.saveDetectionSample();
      status.textContent = result?.ok ? 'Detection sample saved' : 'No detection sample';
    });
    openButton.addEventListener('click', async () => {
      if (!await window.overlayApi.openOcrDiagnosticsFolder()) status.textContent = 'Failed to open diagnostics folder';
    });
    useButton.addEventListener('click', async () => {
      try {
        const result = await window.overlayApi.useDetectedSubtitleArea();
        status.textContent = result?.ok ? 'Auto area locked' : 'No detected subtitle area';
      } catch (_) { status.textContent = 'No detected subtitle area'; }
    });
    stopButton.addEventListener('click', async () => {
      try {
        await window.overlayApi.stopAutoTracking();
        status.textContent = 'Auto tracking stopped; using manual area';
      } catch (_) { status.textContent = 'Auto tracking stopped'; }
    });
    window.overlayApi.onDeveloperStatus((event) => {
      if (tools.hidden || typeof event?.stage !== 'string') return;
      if (typeof event.trackerState !== 'string') { status.textContent = event.stage; return; }
      const size = event.lockedArea ? `${Math.round(event.lockedArea.width)}x${Math.round(event.lockedArea.height)}` : '-';
      const lines = event.lineCountEstimate ?? '-';
      const expanded = event.expandedTop && event.expandedBottom ? 'top/bottom' : event.expandedTop ? 'top' : event.expandedBottom ? 'bottom' : 'no';
      const duration = Math.round((event.emptyDurationMs || 0) / 100) / 10;
      const area = event.activeOcrArea ? `${Math.round(event.activeOcrArea.x)},${Math.round(event.activeOcrArea.y)} ${Math.round(event.activeOcrArea.width)}x${Math.round(event.activeOcrArea.height)}` : '-';
      const detection = event.detection ? ` | display ${event.detection.displayId} ${event.detection.scaleFactor}x | capture ${event.detection.captureImage?.width}x${event.detection.captureImage?.height} | detector ${event.detection.detectorImage?.width}x${event.detection.detectorImage?.height} | candidate ${event.detection.captureArea ? `${event.detection.captureArea.x},${event.detection.captureArea.y} ${event.detection.captureArea.width}x${event.detection.captureArea.height}` : '-'} | validation ${event.detection.validation?.reason || '-'} | coordinates ${event.detection.coordinateRoundTrip?.valid ? 'ok' : 'invalid'}` : '';
      status.textContent = `${event.stage} | visual ${event.visualizedAreaType || 'none'} / ${event.overlayWindow || 'destroyed'} | active ${area} | ${event.areaSource || 'none'} | ${event.trackerState} | ${size} | lines ${lines} | expanded ${expanded} | empty ${duration}s | capture ${event.captureCount || 0} | OCR ${event.ocrRequestCount || 0} | accepted ${event.acceptedSubtitleCount || 0} | duplicates ${event.duplicateRejectedCount || 0} | empty results ${event.emptyResultCount || 0} | changed ${event.stage.includes('unchanged') ? 'no' : 'yes'} | 640 ${event.detector640Ms || 0}ms | fallback ${event.fallbackCount || 0}/${event.fallbackDetectorMs || 0}ms | OCR/min ${event.ocrRequestsPerMinute || 0} | search/min ${event.globalSearchesPerMinute || 0}${detection}`;
    });
  }

  // This optional feature must never prevent the already initialized main UI from working.
  try {
    initializeSubtitleAreaDetection();
  } catch (error) {
    console.error('Subtitle area detection controls failed to initialize', error);
  }
})();

window.overlayApi.onDeveloperOcrZoneTheme((color) => { document.getElementById('zone').style.borderColor = color; });
window.overlayApi.onDeveloperOcrZoneStyle((type) => { document.getElementById('zone').dataset.type = type; });
window.overlayApi.onDeveloperOcrZoneState((state) => { document.getElementById('zone').dataset.type = state?.type || ''; });

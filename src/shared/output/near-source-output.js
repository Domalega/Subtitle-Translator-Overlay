(function initNearSourceOutput(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.NearSourceOutputModule = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createNearSourceOutput() {
  class NearSourceOutput {
    constructor(dependencies) {
      this.dependencies = dependencies;
      this.lastSourceText = '';
      this.lastTranslation = '';
      this.visible = false;
    }

    invoke(name, ...args) {
      try { Promise.resolve(this.dependencies[name](...args)).catch(error => this.dependencies.onError?.(error)); }
      catch (error) { this.dependencies.onError?.(error); }
    }

    showRecognizedText(text) { this.lastSourceText = typeof text === 'string' ? text : ''; }
    showTranslationPending(sourceText) { if (typeof sourceText === 'string') this.lastSourceText = sourceText; }

    showTranslation(translatedText, sourceText) {
      if (typeof sourceText === 'string') this.lastSourceText = sourceText;
      if (typeof translatedText !== 'string' || !translatedText.trim()) return;
      this.lastTranslation = translatedText;
      this.visible = true;
      this.invoke('showOverlay', { text: translatedText });
    }

    showTranslationError(_error) {}
    setStatus(_status) {}

    clear() {
      this.lastSourceText = '';
      this.lastTranslation = '';
      this.visible = false;
      this.invoke('clearOverlay');
    }

    setVisible(visible) {
      this.visible = Boolean(visible);
      if (!this.visible) this.invoke('hideOverlay');
      else if (this.lastTranslation) this.invoke('showOverlay', { text: this.lastTranslation });
    }

    setSettings(settings) { this.invoke('updateOverlaySettings', settings); }
  }

  return { NearSourceOutput };
}));

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

    showRecognizedText(text) { this.lastSourceText = typeof text === 'string' ? text : ''; }
    showTranslationPending(sourceText) { if (typeof sourceText === 'string') this.lastSourceText = sourceText; }

    showTranslation(translatedText, sourceText) {
      if (typeof sourceText === 'string') this.lastSourceText = sourceText;
      if (typeof translatedText !== 'string' || !translatedText.trim()) return;
      this.lastTranslation = translatedText;
      this.visible = true;
      this.dependencies.showOverlay({ text: translatedText });
    }

    showTranslationError(_error) {}
    setStatus(_status) {}

    clear() {
      this.lastSourceText = '';
      this.lastTranslation = '';
      this.visible = false;
      this.dependencies.clearOverlay();
    }

    setVisible(visible) {
      this.visible = Boolean(visible);
      if (!this.visible) this.dependencies.hideOverlay();
      else if (this.lastTranslation) this.dependencies.showOverlay({ text: this.lastTranslation });
    }

    setSettings(settings) { this.dependencies.updateOverlaySettings(settings); }
  }

  return { NearSourceOutput };
}));

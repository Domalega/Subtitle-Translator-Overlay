(function initOutputRouter(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.OutputRouterModule = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createOutputRouter() {
  class OutputRouter {
    constructor({ mainOutput, nearSourceOutput }) {
      this.mainOutput = mainOutput;
      this.nearSourceOutput = nearSourceOutput;
      this.displayMode = 'panel';
      this.gameMode = false;
      this.lastRecognizedText = '';
      this.lastTranslation = '';
    }

    setDisplayMode(mode) {
      this.displayMode = ['panel', 'overlay', 'both'].includes(mode) ? mode : 'panel';
      if (!this.shouldUseOverlay()) {
        this.nearSourceOutput.setVisible(false);
      } else if (this.lastTranslation) {
        this.nearSourceOutput.showTranslation(this.lastTranslation, this.lastRecognizedText);
      }
    }

    setGameMode(enabled) {
      this.gameMode = Boolean(enabled);
      if (this.gameMode) this.nearSourceOutput.setVisible(false);
      else this.setDisplayMode(this.displayMode);
    }

    shouldUseOverlay() {
      return !this.gameMode && (this.displayMode === 'overlay' || this.displayMode === 'both');
    }

    shouldUsePanel() {
      return this.gameMode || this.displayMode === 'panel' || this.displayMode === 'both';
    }

    showRecognizedText(text) {
      this.lastRecognizedText = typeof text === 'string' ? text : '';
      if (this.shouldUsePanel()) this.mainOutput.showRecognizedText(text);
      if (this.shouldUseOverlay()) this.nearSourceOutput.showRecognizedText(text);
    }

    showTranslationPending(sourceText) {
      if (this.shouldUsePanel()) this.mainOutput.showTranslationPending(sourceText);
      if (this.shouldUseOverlay()) this.nearSourceOutput.showTranslationPending(sourceText);
    }

    showTranslation(translatedText, sourceText) {
      if (typeof sourceText === 'string') this.lastRecognizedText = sourceText;
      if (typeof translatedText === 'string' && translatedText.trim()) this.lastTranslation = translatedText;
      if (this.shouldUsePanel()) this.mainOutput.showTranslation(translatedText, sourceText);
      if (this.shouldUseOverlay()) this.nearSourceOutput.showTranslation(translatedText, sourceText || this.lastRecognizedText);
      if (typeof process !== 'undefined' && process.env?.OCR_DEBUG === '1') console.debug('[OCR] output routed', { panel: this.shouldUsePanel(), overlay: this.shouldUseOverlay(), textLength: String(translatedText || '').length });
    }

    showTranslationError(error) {
      if (this.shouldUsePanel()) this.mainOutput.showTranslationError(error);
      if (this.shouldUseOverlay()) this.nearSourceOutput.showTranslationError(error);
    }

    setStatus(status) { this.mainOutput.setStatus(status); }

    clear() {
      this.lastRecognizedText = '';
      this.lastTranslation = '';
      this.mainOutput.clear();
      this.nearSourceOutput.clear();
    }

    hideOverlay() { this.nearSourceOutput.setVisible(false); }

    setVisible(visible) {
      this.mainOutput.setVisible(visible);
      if (!visible || this.shouldUseOverlay()) this.nearSourceOutput.setVisible(visible);
    }
  }

  return { OutputRouter };
}));

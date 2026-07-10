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
      this.displayMode = mode === 'near-source' ? 'near-source' : 'panel';
      if (this.displayMode !== 'near-source' || this.gameMode) {
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

    shouldUseNearSource() {
      return this.displayMode === 'near-source' && !this.gameMode;
    }

    showRecognizedText(text) {
      this.lastRecognizedText = typeof text === 'string' ? text : '';
      this.mainOutput.showRecognizedText(text);
      if (this.shouldUseNearSource()) this.nearSourceOutput.showRecognizedText(text);
    }

    showTranslationPending(sourceText) {
      this.mainOutput.showTranslationPending(sourceText);
      if (this.shouldUseNearSource()) this.nearSourceOutput.showTranslationPending(sourceText);
    }

    showTranslation(translatedText, sourceText) {
      if (typeof sourceText === 'string') this.lastRecognizedText = sourceText;
      if (typeof translatedText === 'string' && translatedText.trim()) this.lastTranslation = translatedText;
      this.mainOutput.showTranslation(translatedText, sourceText);
      if (this.shouldUseNearSource()) this.nearSourceOutput.showTranslation(translatedText, sourceText || this.lastRecognizedText);
    }

    showTranslationError(error) {
      this.mainOutput.showTranslationError(error);
      if (this.shouldUseNearSource()) this.nearSourceOutput.showTranslationError(error);
    }

    setStatus(status) { this.mainOutput.setStatus(status); }

    clear() {
      this.lastRecognizedText = '';
      this.lastTranslation = '';
      this.mainOutput.clear();
      this.nearSourceOutput.clear();
    }

    setVisible(visible) {
      this.mainOutput.setVisible(visible);
      if (!visible || this.shouldUseNearSource()) this.nearSourceOutput.setVisible(visible);
    }
  }

  return { OutputRouter };
}));

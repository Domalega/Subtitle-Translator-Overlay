(function initMainPanelOutput(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MainPanelOutputModule = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createMainPanelOutput() {
  class MainPanelOutput {
    constructor(elements) {
      this.englishTextElement = elements.englishTextElement;
      this.russianTextElement = elements.russianTextElement;
      this.statusElement = elements.statusElement;
    }

    showRecognizedText(text) {
      if (this.englishTextElement) this.englishTextElement.textContent = text;
    }

    showTranslation(text) {
      if (this.russianTextElement) this.russianTextElement.textContent = text;
    }

    showTranslationPending() {
      if (this.russianTextElement && (!this.russianTextElement.textContent || this.russianTextElement.textContent === 'Translation will appear here')) {
        this.russianTextElement.textContent = 'Translating...';
      }
    }

    showTranslationError(message) {
      if (this.statusElement) this.statusElement.textContent = message || 'Translation failed';
    }

    setStatus(message) {
      if (this.statusElement) this.statusElement.textContent = message || '';
    }

    clear() {
      if (this.englishTextElement) this.englishTextElement.textContent = '';
      if (this.russianTextElement) this.russianTextElement.textContent = '';
    }

    setVisible(_visible) {}
  }

  return { MainPanelOutput };
}));

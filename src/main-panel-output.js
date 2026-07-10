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
      this.englishTextElement.textContent = text;
    }

    showTranslation(text) {
      this.russianTextElement.textContent = text;
    }

    showTranslationPending() {
      if (!this.russianTextElement.textContent || this.russianTextElement.textContent === 'Translation will appear here') {
        this.russianTextElement.textContent = 'Translating...';
      }
    }

    showTranslationError(message) {
      this.statusElement.textContent = message || 'Translation failed';
    }

    setStatus(message) {
      this.statusElement.textContent = message || '';
    }

    clear() {
      this.englishTextElement.textContent = '';
      this.russianTextElement.textContent = '';
    }

    setVisible(_visible) {}
  }

  return { MainPanelOutput };
}));

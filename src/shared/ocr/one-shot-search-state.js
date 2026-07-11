(function initOneShotSearchState(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.OneShotSearchStateModule = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createOneShotSearchState() {
  class OneShotSearchState {
    constructor() {
      this.state = 'idle';
    }

    async run(action) {
      if (this.state === 'searching') return { ignored: true };
      this.state = 'searching';
      try {
        const result = await action();
        this.state = result?.found ? 'found' : 'not-found';
        return result;
      } catch (error) {
        this.state = 'failed';
        throw error;
      }
    }
  }
  return { OneShotSearchState };
}));

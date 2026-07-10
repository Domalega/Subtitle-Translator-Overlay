(function initSubtitleStabilizer(root, factory) {
  const deps = typeof require === 'function' ? { textUtils: require('./text-utils') } : { textUtils: root.TextUtils };
  const api = factory(deps.textUtils);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SubtitleStabilizerModule = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createSubtitleStabilizer(textUtils) {
  class SubtitleStabilizer {
    constructor(options = {}) {
      this.emptyFrameThreshold = options.emptyFrameThreshold || 3;
      this.reset();
    }

    reset() {
      this.lastAcceptedText = '';
      this.candidateText = '';
      this.candidateNormalizedText = '';
      this.candidateCount = 0;
      this.emptyFrameCount = 0;
    }

    process(rawText, confidence) {
      const text = String(rawText || '').trim();
      const evaluation = textUtils.evaluateOcrResult({ text, confidence });
      if (!evaluation.accepted) {
        this.emptyFrameCount += 1;
        return {
          rawText: text,
          normalizedText: '',
          accepted: false,
          candidate: false,
          reason: text ? evaluation.reason : 'empty',
          shouldClearAfterHold: this.emptyFrameCount >= this.emptyFrameThreshold,
          replacesPrevious: false
        };
      }

      this.emptyFrameCount = 0;
      const normalizedText = textUtils.normalizeOcrText(text);
      const comparison = textUtils.compareSubtitleText(normalizedText, this.lastAcceptedText);

      if (comparison === 'same' || comparison === 'similar') {
        return {
          rawText: text,
          normalizedText,
          accepted: false,
          candidate: false,
          reason: comparison,
          shouldClearAfterHold: false,
          replacesPrevious: false
        };
      }

      const base = this.candidateNormalizedText || this.lastAcceptedText;
      const isGrowing = textUtils.isGrowingSubtitle(normalizedText, base);
      if (normalizedText === this.candidateNormalizedText) this.candidateCount += 1;
      else this.candidateCount = 1;
      this.candidateText = text;
      this.candidateNormalizedText = normalizedText;

      return {
        rawText: text,
        normalizedText,
        accepted: false,
        candidate: true,
        reason: isGrowing ? 'growing' : 'candidate',
        shouldClearAfterHold: false,
        replacesPrevious: Boolean(this.lastAcceptedText),
        candidateCount: this.candidateCount
      };
    }

    acceptCandidate() {
      if (!this.candidateNormalizedText) {
        return { accepted: false, reason: 'no-candidate', normalizedText: '' };
      }

      this.lastAcceptedText = this.candidateNormalizedText;
      return {
        rawText: this.candidateText,
        normalizedText: this.candidateNormalizedText,
        accepted: true,
        reason: 'accepted',
        replacesPrevious: false
      };
    }
  }

  return { SubtitleStabilizer };
}));

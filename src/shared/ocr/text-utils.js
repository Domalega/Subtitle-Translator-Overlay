(function initTextUtils(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TextUtils = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createTextUtils() {
  function cleanScreenOcrText(text) {
    const cleaned = String(text || '')
      .replace(/[|_{}[\]<>~`^]/g, '')
      .replace(/\b(?:ENGLISH|RUSSIAN|Screen OCR|Click-through|Open SRT|Hide controls|Offset|Start)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    return cleaned.replace(/^[^A-Za-z[("']+/, '').trim();
  }

  function normalizeOcrText(text) {
    return String(text || '')
      .replace(/[\r\n]+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^\s*[\-–—]\s*/, '')
      .trim()
      .toLowerCase();
  }

  function isLikelySubtitle(text) {
    if (!text || text.length < 2 || text.length > 180) return false;
    if (!/[a-zA-Z]/.test(text)) return false;
    if (/[&=:%]{2,}/.test(text)) return false;
    if ((text.match(/[A-Za-z]/g) || []).length < text.length * 0.45) return false;
    if (/\b(?:Tosapminzam|zay2o0e|FBRo|Screen OCR|Click-through)\b/i.test(text)) return false;
    return !/^\d{1,2}:\d{2}/.test(text);
  }

  function evaluateOcrResult({ text, confidence }) {
    const value = String(text || '').trim();
    const words = value.match(/[A-Za-z]+(?:['-][A-Za-z]+)*/g) || [];
    const letters = (value.match(/[A-Za-z]/g) || []).length;
    const symbols = (value.match(/[^A-Za-z0-9\s.,!?;:'"()\-]/g) || []).length;
    const singleLetters = words.filter(word => word.length === 1).length;
    const confidenceIsLow = Number.isFinite(confidence) && confidence < 35;
    const hasShortValidPhrase = /^(?:no|go|wait|run|help|yes)[.!?]?$/i.test(value);
    const isValid = hasShortValidPhrase || (
      isLikelySubtitle(value)
      && words.length > 0
      && singleLetters / words.length < 0.5
      && !words.every(word => word.length === 1)
      && symbols <= Math.max(2, Math.floor(value.length * 0.15))
      && letters / Math.max(1, value.length) >= 0.55
      && !confidenceIsLow
    );
    return { accepted: isValid, reason: isValid ? 'valid' : confidenceIsLow ? 'low-confidence' : 'artifact' };
  }

  function isSimilarText(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    const maxLen = Math.max(a.length, b.length);
    if (maxLen < 20) return false;
    const minLen = Math.min(a.length, b.length);
    if (minLen / maxLen < 0.55) return false;
    const wordsA = a.split(/\s+/);
    const wordsB = b.split(/\s+/);
    const setA = new Set(wordsA);
    const setB = new Set(wordsB);
    let intersection = 0;
    for (const word of setA) {
      if (setB.has(word)) intersection += 1;
    }
    const union = setA.size + setB.size - intersection;
    if (union === 0) return false;
    return (intersection / union) >= 0.75;
  }

  function isGrowingSubtitle(normalizedText, previousText) {
    return Boolean(previousText && (normalizedText.startsWith(previousText) || previousText.startsWith(normalizedText)));
  }

  function compareSubtitleText(normalizedText, previousText) {
    if (normalizedText === previousText) return 'same';
    if (isSimilarText(normalizedText, previousText)) return 'similar';
    if (isGrowingSubtitle(normalizedText, previousText)) return 'growing';
    return 'new';
  }

  return {
    cleanScreenOcrText,
    normalizeOcrText,
    isLikelySubtitle,
    evaluateOcrResult,
    isSimilarText,
    isGrowingSubtitle,
    compareSubtitleText
  };
}));

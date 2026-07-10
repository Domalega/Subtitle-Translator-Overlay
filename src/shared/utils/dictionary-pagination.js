(function initDictionaryPagination(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DictionaryPagination = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createDictionaryPagination() {
  function calculateDictionaryPageSize(availableHeight, itemHeight, fallbackPageSize = 1) {
    const fallback = Number.isFinite(fallbackPageSize) && fallbackPageSize > 0 ? Math.floor(fallbackPageSize) : 1;
    if (!Number.isFinite(availableHeight) || availableHeight <= 0) return fallback;
    if (!Number.isFinite(itemHeight) || itemHeight <= 0) return fallback;
    return Math.max(1, Math.floor(availableHeight / itemHeight));
  }

  function createDictionaryPagination(totalItems, pageSize, currentPage) {
    const safePageSize = Math.max(1, Math.floor(pageSize) || 1);
    const safeTotalItems = Math.max(0, Math.floor(totalItems) || 0);
    const totalPages = Math.max(1, Math.ceil(safeTotalItems / safePageSize));
    const page = Math.min(Math.max(1, Math.floor(currentPage) || 1), totalPages);
    const start = (page - 1) * safePageSize;
    const end = start + safePageSize;
    return { pageSize: safePageSize, totalPages, page, start, end };
  }

  return { calculateDictionaryPageSize, createDictionaryPagination };
}));

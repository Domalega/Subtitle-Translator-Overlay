const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateDictionaryPageSize,
  createDictionaryPagination
} = require('../../../src/shared/utils/dictionary-pagination');

test('calculateDictionaryPageSize handles normal height', () => {
  assert.equal(calculateDictionaryPageSize(360, 72), 5);
});

test('calculateDictionaryPageSize keeps fallback for zero height', () => {
  assert.equal(calculateDictionaryPageSize(0, 72, 6), 6);
});

test('calculateDictionaryPageSize keeps at least one row for small window', () => {
  assert.equal(calculateDictionaryPageSize(30, 72), 1);
});

test('createDictionaryPagination reflects changed available height', () => {
  const small = createDictionaryPagination(20, calculateDictionaryPageSize(144, 72), 1);
  const large = createDictionaryPagination(20, calculateDictionaryPageSize(360, 72), 1);
  assert.equal(small.pageSize, 2);
  assert.equal(large.pageSize, 5);
});

test('createDictionaryPagination clamps current page', () => {
  assert.deepEqual(createDictionaryPagination(7, 5, 9), {
    pageSize: 5,
    totalPages: 2,
    page: 2,
    start: 5,
    end: 10
  });
});

test('createDictionaryPagination handles empty list', () => {
  assert.deepEqual(createDictionaryPagination(0, 5, 3), {
    pageSize: 5,
    totalPages: 1,
    page: 1,
    start: 0,
    end: 5
  });
});

const closeWindowButton = document.getElementById('closeWindow');
const dictionarySort = document.getElementById('dictionarySort');
const dictionarySearch = document.getElementById('dictionarySearch');
const dictionaryList = document.getElementById('dictionaryList');
const dictionaryPrevButton = document.getElementById('dictionaryPrev');
const dictionaryNextButton = document.getElementById('dictionaryNext');
const dictionaryPageInfo = document.getElementById('dictionaryPageInfo');
const studyButton = document.getElementById('studyButton');
const exportButton = document.getElementById('exportButton');

const contextModal = document.getElementById('contextModal');
const closeContextModalButton = document.getElementById('closeContextModal');
const contextContent = document.getElementById('contextContent');

const deleteConfirmModal = document.getElementById('deleteConfirmModal');
const closeDeleteConfirmModalButton = document.getElementById('closeDeleteConfirmModal');
const cancelDeleteButton = document.getElementById('cancelDelete');
const confirmDeleteButton = document.getElementById('confirmDelete');
const wordToDeleteSpan = document.getElementById('wordToDelete');

const studyModal = document.getElementById('studyModal');
const closeStudyModal = document.getElementById('closeStudyModal');
const studyWordEl = document.getElementById('studyWord');
const studyTranslationEl = document.getElementById('studyTranslation');
const showTranslationBtn = document.getElementById('showTranslationBtn');
const studyEasyBtn = document.getElementById('studyEasyBtn');
const studyHardBtn = document.getElementById('studyHardBtn');
const studyNextBtn = document.getElementById('studyNextBtn');

const exportModal = document.getElementById('exportModal');
const closeExportModal = document.getElementById('closeExportModal');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const exportJsonBtn = document.getElementById('exportJsonBtn');

const ITEM_HEIGHT = 72;
let page = 1;
let pageSize = 1;
let wordToDeleteId = null;
let wordToDeleteElement = null;
let studyWords = [];
let studyIndex = 0;
let studyTranslationShown = false;
let filteredEntries = [];
let deleteConfirmEnabled = true;
const { calculateDictionaryPageSize, createDictionaryPagination } = window.DictionaryPagination;

function getPageSize() {
  pageSize = calculateDictionaryPageSize(dictionaryList.clientHeight, ITEM_HEIGHT, pageSize);
  return pageSize;
}

document.body.dataset.theme = 'green';

window.overlayApi.onApplyUiSetting(({ key, value }) => {
  if (key === 'theme') {
    document.body.dataset.theme = value;
    localStorage.setItem('subtitle-overlay-theme', value);
  }
  if (key === 'deleteConfirm') {
    deleteConfirmEnabled = value !== false;
    localStorage.setItem('subtitle-confirm-delete', deleteConfirmEnabled);
  }
});

async function loadUiSettings() {
  try {
    const settings = await window.overlayApi.getUiSettings();
    document.body.dataset.theme = settings.theme || 'green';
    localStorage.setItem('subtitle-overlay-theme', document.body.dataset.theme);
    deleteConfirmEnabled = settings.deleteConfirm !== false;
    localStorage.setItem('subtitle-confirm-delete', deleteConfirmEnabled);
  } catch (_) {}
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

function highlightWord(sentence, word) {
  const escapedWord = escapeRegExp(word || '');
  if (!escapedWord) return sentence;
  return sentence.replace(new RegExp(`\\b(${escapedWord})\\b`, 'gi'), '<span class="highlight">$1</span>');
}

function speakWord(word) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = 'en-US';
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
}

function sortEntries(entries) {
  const sorted = [...entries];
  const mode = dictionarySort.value;
  if (mode === 'date-asc') sorted.sort((a, b) => a.addedAt - b.addedAt);
  else if (mode === 'alpha-asc') sorted.sort((a, b) => (a.english || a.sourceText || '').localeCompare(b.english || b.sourceText || ''));
  else if (mode === 'alpha-desc') sorted.sort((a, b) => (b.english || b.sourceText || '').localeCompare(a.english || a.sourceText || ''));
  else sorted.sort((a, b) => b.addedAt - a.addedAt);
  return sorted;
}

function filterEntries(entries, query) {
  if (!query) return entries;
  const q = query.toLowerCase();
  return entries.filter(e =>
    (e.english || '').toLowerCase().includes(q) ||
    (e.russian || '').toLowerCase().includes(q) ||
    (e.sourceText || '').toLowerCase().includes(q) ||
    new Date(e.addedAt).toLocaleDateString().includes(q)
  );
}

async function renderDictionary() {
  const allEntries = sortEntries(await window.overlayApi.dictionaryGet());
  const query = dictionarySearch.value.trim();
  filteredEntries = filterEntries(allEntries, query);

  const pagination = createDictionaryPagination(filteredEntries.length, getPageSize(), page);
  page = pagination.page;
  const pageEntries = filteredEntries.slice(pagination.start, pagination.end);

  dictionaryList.textContent = '';

  if (filteredEntries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'emptyState';
    empty.textContent = query ? 'No matching words found.' : 'No words yet. Select a word in the overlay and press Add word.';
    dictionaryList.append(empty);
  }

  pageEntries.forEach((entry) => {
    const item = document.createElement('article');
    item.className = 'dictionaryItem';
    item.dataset.id = entry.id;

    const english = document.createElement('strong');
    english.textContent = entry.english || entry.sourceText;

    const russian = document.createElement('span');
    russian.textContent = entry.russian || '';

    const meta = document.createElement('small');
    meta.textContent = [entry.transcription, new Date(entry.addedAt).toLocaleDateString()].filter(Boolean).join(' · ');

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'dictionaryItemButtons';

    const listen = document.createElement('button');
    listen.className = 'listenButton';
    listen.type = 'button';
    listen.textContent = 'Listen';
    listen.addEventListener('click', () => speakWord(entry.english || entry.sourceText));

    const context = document.createElement('button');
    context.className = 'contextButton';
    context.type = 'button';
    context.textContent = 'Context';
    context.addEventListener('click', async () => {
      const word = entry.english || entry.sourceText;
      contextContent.textContent = '';
      contextContent.innerHTML = 'Loading context...';
      contextModal.classList.add('show');

      const result = await window.overlayApi.getContextSentences(word);
      contextContent.textContent = '';
      if (result.length === 0) {
        contextContent.textContent = 'No context sentences found for this word.';
      } else {
        result.forEach(s => {
          const contextEntry = document.createElement('div');
          contextEntry.className = 'contextEntry';
          const englishSentence = document.createElement('div');
          englishSentence.className = 'englishSentence';
          englishSentence.innerHTML = highlightWord(s.english, word);
          const russianTranslation = document.createElement('div');
          russianTranslation.className = 'russianTranslation';
          russianTranslation.textContent = s.russian;
          contextEntry.append(englishSentence, russianTranslation);
          contextContent.append(contextEntry);
        });
      }
    });

    const remove = document.createElement('button');
    remove.className = 'deleteButton';
    remove.type = 'button';
    remove.textContent = '\uD83D\uDDD1';
    remove.title = 'Delete word';
    remove.addEventListener('click', async () => {
      if (!deleteConfirmEnabled) {
        await window.overlayApi.dictionaryDelete(entry.id);
        return;
      }
      wordToDeleteId = entry.id;
      wordToDeleteElement = item;
      wordToDeleteSpan.textContent = entry.english || entry.sourceText;
      deleteConfirmModal.classList.add('show');
    });

    buttonContainer.append(listen, context, remove);
    item.append(english, russian, meta, buttonContainer);
    dictionaryList.append(item);
  });

  dictionaryPageInfo.textContent = `Page ${page} / ${pagination.totalPages}`;
  dictionaryPrevButton.disabled = page <= 1;
  dictionaryNextButton.disabled = page >= pagination.totalPages;
}

let layoutRenderScheduled = false;
function renderDictionaryAfterLayout() {
  if (layoutRenderScheduled) return;
  layoutRenderScheduled = true;
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      layoutRenderScheduled = false;
      renderDictionary();
    });
  });
}

function hideModal(modalElement) {
  modalElement.classList.remove('show');
}

function showStudyWord() {
  if (studyWords.length === 0) return;
  const entry = studyWords[studyIndex];
  studyWordEl.textContent = entry.english || entry.sourceText;
  studyTranslationEl.textContent = '';
  showTranslationBtn.style.display = '';
  studyEasyBtn.style.display = 'none';
  studyHardBtn.style.display = 'none';
  studyNextBtn.style.display = 'none';
  studyTranslationShown = false;
}

function nextStudyWord() {
  if (studyWords.length === 0) return;
  studyIndex = (studyIndex + 1) % studyWords.length;
  showStudyWord();
}

closeWindowButton.addEventListener('click', () => window.overlayApi.closeCurrentWindow());

dictionarySort.addEventListener('change', () => { page = 1; renderDictionary(); });
dictionarySearch.addEventListener('input', () => { page = 1; renderDictionary(); });

dictionaryPrevButton.addEventListener('click', () => { page -= 1; renderDictionary(); });
dictionaryNextButton.addEventListener('click', () => { page += 1; renderDictionary(); });

closeContextModalButton.addEventListener('click', () => hideModal(contextModal));
contextModal.addEventListener('click', (e) => { if (e.target === contextModal) hideModal(contextModal); });

closeDeleteConfirmModalButton.addEventListener('click', () => hideModal(deleteConfirmModal));
cancelDeleteButton.addEventListener('click', () => hideModal(deleteConfirmModal));

confirmDeleteButton.addEventListener('click', async () => {
  if (wordToDeleteId && wordToDeleteElement) {
    wordToDeleteElement.style.opacity = '0';
    wordToDeleteElement.style.transform = 'translateX(20px)';
    wordToDeleteElement.style.height = '0';
    wordToDeleteElement.style.overflow = 'hidden';
    window.setTimeout(async () => {
      await window.overlayApi.dictionaryDelete(wordToDeleteId);
      wordToDeleteId = null;
      wordToDeleteElement = null;
      hideModal(deleteConfirmModal);
    }, 220);
  }
});

deleteConfirmModal.addEventListener('click', (e) => { if (e.target === deleteConfirmModal) hideModal(deleteConfirmModal); });

studyButton.addEventListener('click', async () => {
  const allEntries = await window.overlayApi.dictionaryGet();
  studyWords = sortEntries(allEntries);
  if (studyWords.length === 0) return;
  studyIndex = 0;
  studyModal.classList.add('show');
  showStudyWord();
});

showTranslationBtn.addEventListener('click', () => {
  const entry = studyWords[studyIndex];
  studyTranslationEl.textContent = entry.russian || '';
  showTranslationBtn.style.display = 'none';
  studyEasyBtn.style.display = '';
  studyHardBtn.style.display = '';
  studyNextBtn.style.display = '';
  studyTranslationShown = true;
});

studyEasyBtn.addEventListener('click', nextStudyWord);
studyHardBtn.addEventListener('click', nextStudyWord);
studyNextBtn.addEventListener('click', nextStudyWord);
closeStudyModal.addEventListener('click', () => hideModal(studyModal));
studyModal.addEventListener('click', (e) => { if (e.target === studyModal) hideModal(studyModal); });

exportButton.addEventListener('click', () => exportModal.classList.add('show'));
closeExportModal.addEventListener('click', () => hideModal(exportModal));
exportModal.addEventListener('click', (e) => { if (e.target === exportModal) hideModal(exportModal); });

exportCsvBtn.addEventListener('click', async () => {
  const entries = await window.overlayApi.dictionaryGet();
  await window.overlayApi.exportDictionary(entries, 'csv');
  hideModal(exportModal);
});

exportJsonBtn.addEventListener('click', async () => {
  const entries = await window.overlayApi.dictionaryGet();
  await window.overlayApi.exportDictionary(entries, 'json');
  hideModal(exportModal);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (contextModal.classList.contains('show')) hideModal(contextModal);
    else if (deleteConfirmModal.classList.contains('show')) hideModal(deleteConfirmModal);
    else if (studyModal.classList.contains('show')) hideModal(studyModal);
    else if (exportModal.classList.contains('show')) hideModal(exportModal);
  }
});

window.overlayApi.onDictionaryChanged(renderDictionary);

if ('ResizeObserver' in window) {
  const resizeObserver = new ResizeObserver(() => renderDictionaryAfterLayout());
  resizeObserver.observe(dictionaryList);
}

window.addEventListener('load', renderDictionaryAfterLayout);

if (document.fonts?.ready) {
  document.fonts.ready.then(renderDictionaryAfterLayout).catch(() => {});
}

let resizeDebounce;
window.addEventListener('resize', () => {
  window.clearTimeout(resizeDebounce);
  resizeDebounce = window.setTimeout(renderDictionaryAfterLayout, 150);
});

loadUiSettings().then(() => {
  renderDictionary();
  renderDictionaryAfterLayout();
});

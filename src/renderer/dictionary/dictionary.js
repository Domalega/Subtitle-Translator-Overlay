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
const studyNextBtn = document.getElementById('studyNextBtn');

const exportModal = document.getElementById('exportModal');
const closeExportModal = document.getElementById('closeExportModal');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const exportJsonBtn = document.getElementById('exportJsonBtn');

const ITEMS_PER_PAGE = 20;
let page = 1;
let pageSize = 1;
let wordToDeleteId = null;
let wordToDeleteElement = null;
let studyWords = [];
let studyIndex = 0;
let studyTranslationShown = false;
let filteredEntries = [];
let deleteConfirmEnabled = true;
let renderRequestId = 0;
let contextRequestId = 0;
const { calculateDictionaryPageSize, createDictionaryPagination } = window.DictionaryPagination;

function getPageSize() {
  pageSize = ITEMS_PER_PAGE;
  return pageSize;
}

document.body.dataset.theme = 'dark';

window.overlayApi.onApplyUiSetting(({ key, value }) => {
  if (key === 'font') window.Appearance.apply({font:value});
  if (key === 'theme') {
    window.Themes.apply(document,value); document.body.dataset.theme = window.Themes.normalizeId(value);
    localStorage.setItem('subtitle-overlay-theme', value);
  }
  if (key === 'deleteConfirm') {
    deleteConfirmEnabled = value !== false;
    localStorage.setItem('subtitle-confirm-delete', deleteConfirmEnabled);
  }
});

async function loadUiSettings() {
  try {
    const settings = await window.uiReady; window.Appearance.apply(settings);
    window.Themes.apply(document,settings.theme); document.body.dataset.theme = window.Themes.normalizeId(settings.theme);
    localStorage.setItem('subtitle-overlay-theme', document.body.dataset.theme);
    deleteConfirmEnabled = settings.deleteConfirm !== false;
    localStorage.setItem('subtitle-confirm-delete', deleteConfirmEnabled);
  } catch (_) {}
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

function highlightWord(sentence, word) {
  const fragment = document.createDocumentFragment();
  const text = String(sentence || '');
  const escaped = escapeRegExp(word || '');
  if (!escaped) { fragment.append(document.createTextNode(text)); return fragment; }
  const pattern = new RegExp('\\b(' + escaped + ')\\b', 'gi');
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    fragment.append(document.createTextNode(text.slice(offset, match.index)));
    const span = document.createElement('span'); span.className = 'highlight'; span.textContent = match[0];
    fragment.append(span); offset = match.index + match[0].length;
  }
  fragment.append(document.createTextNode(text.slice(offset)));
  return fragment;
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
  const requestId = ++renderRequestId;
  let entries;
  try { entries = await window.overlayApi.dictionaryGet(); } catch (error) {
    if (requestId === renderRequestId) dictionaryList.textContent = `Could not load dictionary: ${error.message}`;
    return;
  }
  if (requestId !== renderRequestId) return;
  const allEntries = sortEntries(entries);
  const query = dictionarySearch.value.trim();
  filteredEntries = filterEntries(allEntries, query);

  const pagination = createDictionaryPagination(filteredEntries.length, getPageSize(), page);
  page = pagination.page;
  const pageEntries = filteredEntries.slice(pagination.start, pagination.end);

  dictionaryList.textContent = '';

  if (filteredEntries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'emptyState';
    empty.textContent = query ? window.I18n.t("no.matching.words.found") : window.I18n.t("no.words.yet.select.text.in.the.translation.window.then.choose.ad");
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
    listen.textContent = window.I18n.t("listen");
    listen.addEventListener('click', () => speakWord(entry.english || entry.sourceText));

    const context = document.createElement('button');
    context.className = 'contextButton';
    context.type = 'button';
    context.textContent = window.I18n.t("context");
    context.addEventListener('click', async () => {
      const requestId = ++contextRequestId;
      const word = entry.english || entry.sourceText;
      contextContent.textContent = '';
      contextContent.textContent = window.I18n.t("loading.context");
      window.Dialogs.show(contextModal);

      let result;
      try { result = await window.overlayApi.getContextSentences(word); } catch (error) {
        if (requestId === contextRequestId) contextContent.textContent = `Could not load context: ${error.message}`;
        return;
      }
      if (requestId !== contextRequestId || !contextModal.classList.contains('show')) return;
      contextContent.textContent = '';
      if (result.length === 0) {
        contextContent.textContent = window.I18n.t("no.context.sentences.found.for.this.word");
      } else {
        result.forEach(s => {
          const contextEntry = document.createElement('div');
          contextEntry.className = 'contextEntry';
          const englishSentence = document.createElement('div');
          englishSentence.className = 'englishSentence';
          englishSentence.append(highlightWord(s.english, word));
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
    remove.title = window.I18n.t("delete.word"); remove.setAttribute('aria-label',window.I18n.t("delete.2")+(entry.english || entry.sourceText));
    remove.addEventListener('click', async () => {
      if (!deleteConfirmEnabled) {
        try { await window.overlayApi.dictionaryDelete(entry.id); } catch (error) { dictionaryNotice(window.I18n.t("could.not.delete.word")+error.message); }
        return;
      }
      document.getElementById('deleteStatus').hidden=true;
    wordToDeleteId = entry.id;
      wordToDeleteElement = item;
      wordToDeleteSpan.textContent = window.I18n.t('word.delete.question',{word:entry.english || entry.sourceText});
      window.Dialogs.show(deleteConfirmModal);
    });

    buttonContainer.append(listen, context, remove);
    item.append(english, russian, meta, buttonContainer);
    dictionaryList.append(item);
  });

  dictionaryPageInfo.textContent = window.I18n.t('page.count',{current:page,total:pagination.totalPages});
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
  if (modalElement === contextModal) contextRequestId += 1;
  window.Dialogs.hide(modalElement);
}

function showStudyWord() {
  if (studyWords.length === 0) return;
  document.getElementById('studyProgress').textContent=window.I18n.t('review.progress',{current:studyIndex+1,total:studyWords.length});
  const entry = studyWords[studyIndex];
  studyWordEl.textContent = entry.english || entry.sourceText;
  studyTranslationEl.textContent = '';
  showTranslationBtn.style.display = '';


  studyNextBtn.style.display = 'none';
  studyTranslationShown = false;
}

function nextStudyWord() {
  if (studyWords.length === 0) return;
  studyIndex++;
  if(studyIndex >= studyWords.length) { studyWordEl.textContent=window.I18n.t("review.complete"); studyTranslationEl.textContent=window.I18n.t("you.have.reviewed.all.words.in.this.session"); document.getElementById('studyProgress').textContent=studyWords.length+' / '+studyWords.length; showTranslationBtn.style.display='none'; studyNextBtn.style.display='none'; return; }
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
  if (wordToDeleteId && wordToDeleteElement && !confirmDeleteButton.disabled) {
    const deletedId = wordToDeleteId;
    const deletedElement = wordToDeleteElement;
    confirmDeleteButton.disabled = true;
    wordToDeleteElement.style.opacity = '0';
    wordToDeleteElement.style.transform = 'translateX(20px)';
    wordToDeleteElement.style.height = '0';
    wordToDeleteElement.style.overflow = 'hidden';
    window.setTimeout(async () => {
      try {
        await window.overlayApi.dictionaryDelete(deletedId);
        if (wordToDeleteId === deletedId) { wordToDeleteId = null; wordToDeleteElement = null; hideModal(deleteConfirmModal); }
      } catch (error) {
        deletedElement.removeAttribute('style');
        const errorEl=document.getElementById('deleteStatus'); errorEl.hidden=false; errorEl.textContent=window.I18n.t("could.not.delete.word")+error.message;
      } finally { confirmDeleteButton.disabled = false; }
    }, 220);
  }
});

deleteConfirmModal.addEventListener('click', (e) => { if (e.target === deleteConfirmModal) hideModal(deleteConfirmModal); });

studyButton.addEventListener('click', async () => {
  const allEntries = await window.overlayApi.dictionaryGet().catch(error => { dictionaryNotice(error.message); return []; });
  studyWords = sortEntries(allEntries);
  if (studyWords.length === 0) { dictionaryNotice(window.I18n.t("add.words.before.starting.a.review")); return; }
  studyIndex = 0;
  window.Dialogs.show(studyModal);
  showStudyWord();
});

showTranslationBtn.addEventListener('click', () => {
  const entry = studyWords[studyIndex];
  if (!entry) return;
  studyTranslationEl.textContent = entry.russian || '';
  showTranslationBtn.style.display = 'none';


  studyNextBtn.style.display = '';
  studyTranslationShown = true;
});



studyNextBtn.addEventListener('click', nextStudyWord);
closeStudyModal.addEventListener('click', () => hideModal(studyModal));
studyModal.addEventListener('click', (e) => { if (e.target === studyModal) hideModal(studyModal); });

exportButton.addEventListener('click', () => window.Dialogs.show(exportModal));
closeExportModal.addEventListener('click', () => hideModal(exportModal));
exportModal.addEventListener('click', (e) => { if (e.target === exportModal) hideModal(exportModal); });

async function exportWords(format) {
  exportCsvBtn.disabled=true; exportJsonBtn.disabled=true; const errorEl=document.getElementById('exportStatus'); errorEl.hidden=true;
  try { const entries=await window.overlayApi.dictionaryGet(); if(await window.overlayApi.exportDictionary(entries,format)) { hideModal(exportModal); dictionaryNotice(window.I18n.t("dictionary.exported")); } }
  catch(error) { errorEl.hidden=false; errorEl.textContent=window.I18n.t("could.not.export")+error.message; }
  finally { exportCsvBtn.disabled=false; exportJsonBtn.disabled=false; }
}
exportCsvBtn.addEventListener('click',()=>exportWords('csv'));
exportJsonBtn.addEventListener('click',()=>exportWords('json'));
function dictionaryNotice(message) { const el=document.getElementById('dictionaryStatus'); el.hidden=false; el.textContent=message; }
window.overlayApi.onApplyUiSettings(settings=>{ window.Appearance.apply(settings); window.Themes.apply(document,settings.theme); document.body.dataset.theme=window.Themes.normalizeId(settings.theme); deleteConfirmEnabled=settings.deleteConfirm!==false; });
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

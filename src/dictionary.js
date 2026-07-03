const closeWindowButton = document.getElementById('closeWindow');
const dictionarySort = document.getElementById('dictionarySort');
const dictionaryList = document.getElementById('dictionaryList');
const dictionaryPrevButton = document.getElementById('dictionaryPrev');
const dictionaryNextButton = document.getElementById('dictionaryNext');
const dictionaryPageInfo = document.getElementById('dictionaryPageInfo');
const contextModal = document.getElementById('contextModal');
const closeContextModalButton = document.getElementById('closeContextModal');
const contextContent = document.getElementById('contextContent');

const deleteConfirmModal = document.getElementById('deleteConfirmModal');
const closeDeleteConfirmModalButton = document.getElementById('closeDeleteConfirmModal');
const cancelDeleteButton = document.getElementById('cancelDelete');
const confirmDeleteButton = document.getElementById('confirmDelete');
const wordToDeleteSpan = document.getElementById('wordToDelete');

const pageSize = 9;
let page = 1;
let wordToDeleteId = null;
let wordToDeleteElement = null;

document.body.dataset.theme = localStorage.getItem('subtitle-overlay-theme') || 'green';

window.overlayApi.onApplyUiSetting(({ key, value }) => {
  if (key === 'theme') {
    document.body.dataset.theme = value;
    localStorage.setItem('subtitle-overlay-theme', value);
  }
});

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
  else if (mode === 'alpha-asc') sorted.sort((a, b) => (a.english || a.sourceText).localeCompare(b.english || b.sourceText));
  else if (mode === 'alpha-desc') sorted.sort((a, b) => (b.english || b.sourceText).localeCompare(a.english || a.sourceText));
  else sorted.sort((a, b) => b.addedAt - a.addedAt);

  return sorted;
}

async function renderDictionary() {
  const entries = sortEntries(await window.overlayApi.dictionaryGet());
  const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
  page = Math.min(page, totalPages);
  const pageEntries = entries.slice((page - 1) * pageSize, page * pageSize);

  dictionaryList.textContent = '';

  if (pageEntries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'emptyState';
    empty.textContent = 'No words yet. Select a word in the overlay and press Add word.';
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
          englishSentence.innerHTML = s.english.replace(new RegExp(`\b(${word})\b`, 'gi'), '<span class="highlight">$1</span>');

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
    remove.textContent = '🗑';
    remove.title = 'Delete word';
    remove.addEventListener('click', () => {
      wordToDeleteId = entry.id;
      wordToDeleteElement = item;
      wordToDeleteSpan.textContent = entry.english || entry.sourceText;
      deleteConfirmModal.classList.add('show');
    });

    buttonContainer.append(listen, context, remove);
    item.append(english, russian, meta, buttonContainer);
    dictionaryList.append(item);
  });

  dictionaryPageInfo.textContent = `Page ${page} / ${totalPages}`;
  dictionaryPrevButton.disabled = page <= 1;
  dictionaryNextButton.disabled = page >= totalPages;
}

function hideModal(modalElement) {
  modalElement.classList.remove('show');
}

closeWindowButton.addEventListener('click', () => window.overlayApi.closeCurrentWindow());

dictionarySort.addEventListener('change', () => {
  page = 1;
  renderDictionary();
});

dictionaryPrevButton.addEventListener('click', () => {
  page -= 1;
  renderDictionary();
});

dictionaryNextButton.addEventListener('click', () => {
  page += 1;
  renderDictionary();
});

closeContextModalButton.addEventListener('click', () => {
  hideModal(contextModal);
});

contextModal.addEventListener('click', (event) => {
  if (event.target === contextModal) {
    hideModal(contextModal);
  }
});

closeDeleteConfirmModalButton.addEventListener('click', () => {
  hideModal(deleteConfirmModal);
});

cancelDeleteButton.addEventListener('click', () => {
  hideModal(deleteConfirmModal);
});

confirmDeleteButton.addEventListener('click', async () => {
  if (wordToDeleteId && wordToDeleteElement) {
    // Animate removal
    wordToDeleteElement.style.opacity = '0';
    wordToDeleteElement.style.height = '0';
    wordToDeleteElement.style.overflow = 'hidden';
    wordToDeleteElement.style.transition = 'opacity 0.3s ease-out, height 0.3s ease-out';

    setTimeout(async () => {
      await window.overlayApi.dictionaryDelete(wordToDeleteId);
      wordToDeleteId = null;
      wordToDeleteElement = null;
      hideModal(deleteConfirmModal);
      renderDictionary(); // Re-render to update the list and pagination
    }, 300); // Match CSS transition duration
  }
});

deleteConfirmModal.addEventListener('click', (event) => {
  if (event.target === deleteConfirmModal) {
    hideModal(deleteConfirmModal);
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (contextModal.classList.contains('show')) {
      hideModal(contextModal);
    } else if (deleteConfirmModal.classList.contains('show')) {
      hideModal(deleteConfirmModal);
    }
  }
});

window.overlayApi.onDictionaryChanged(renderDictionary);
renderDictionary();
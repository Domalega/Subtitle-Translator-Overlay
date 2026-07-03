const dictionarySort = document.getElementById('dictionarySort');
const dictionaryList = document.getElementById('dictionaryList');
const dictionaryPrevButton = document.getElementById('dictionaryPrev');
const dictionaryNextButton = document.getElementById('dictionaryNext');
const dictionaryPageInfo = document.getElementById('dictionaryPageInfo');

const pageSize = 9;
let page = 1;

function sortEntries(entries) {
  const sorted = [...entries];
  const mode = dictionarySort.value;

  if (mode === 'date-asc') sorted.sort((a, b) => a.addedAt - b.addedAt);
  else if (mode === 'alpha-asc') sorted.sort((a, b) => (a.english || a.russian).localeCompare(b.english || b.russian));
  else if (mode === 'alpha-desc') sorted.sort((a, b) => (b.english || b.russian).localeCompare(a.english || a.russian));
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

    const english = document.createElement('strong');
    english.textContent = entry.english || entry.sourceText;

    const russian = document.createElement('span');
    russian.textContent = entry.russian || '';

    const meta = document.createElement('small');
    meta.textContent = [entry.transcription, new Date(entry.addedAt).toLocaleDateString()].filter(Boolean).join(' · ');

    item.append(english, russian, meta);
    dictionaryList.append(item);
  });

  dictionaryPageInfo.textContent = `Page ${page} / ${totalPages}`;
  dictionaryPrevButton.disabled = page <= 1;
  dictionaryNextButton.disabled = page >= totalPages;
}

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

window.overlayApi.onDictionaryChanged(renderDictionary);
renderDictionary();

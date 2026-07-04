const cardContainer = document.getElementById('cardContainer');
let savedWords = new Set();

function applyStyle(key, value) {
  if (key === 'cardOpacity') document.documentElement.style.setProperty('--card-opacity', value);
  if (key === 'cardFontSize') document.documentElement.style.setProperty('--card-font', `${value}px`);
  if (key === 'cardWidth') document.documentElement.style.setProperty('--card-width', `${value}px`);
}

function showResult(data) {
  cardContainer.textContent = '';

  if (!data || !data.original) {
    const empty = document.createElement('div');
    empty.className = 'emptyState';
    empty.textContent = 'No English text found on screen.';
    cardContainer.append(empty);
    return;
  }

  const card = document.createElement('div');
  card.className = 'translationCard draggable';

  const header = document.createElement('div');
  header.className = 'cardHeader';
  const title = document.createElement('span');
  title.className = 'cardTitle';
  title.textContent = 'Screen Translation (Ctrl+Shift+T)';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'cardClose';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', () => card.remove());
  header.append(title, closeBtn);

  const origLabel = document.createElement('div');
  origLabel.className = 'sectionLabel';
  origLabel.textContent = 'Original';
  const origText = document.createElement('div');
  origText.className = 'originalText';
  origText.textContent = data.original;

  const trLabel = document.createElement('div');
  trLabel.className = 'sectionLabel';
  trLabel.textContent = 'Translation';
  const trText = document.createElement('div');
  trText.className = 'translatedText';
  trText.textContent = data.translation || 'Translating...';

  card.append(header, origLabel, origText, trLabel, trText);

  if (data.words && data.words.length > 0) {
    const wordList = document.createElement('div');
    wordList.className = 'wordList';
    data.words.forEach((w) => {
      const item = document.createElement('span');
      item.className = 'wordItem';
      item.textContent = w.english;

      const addBtn = document.createElement('span');
      addBtn.className = 'addWordBtn';
      if (savedWords.has(w.english.toLowerCase())) {
        addBtn.classList.add('saved');
        addBtn.textContent = '✓';
      } else {
        addBtn.textContent = '+';
        addBtn.addEventListener('click', () => {
          window.overlayApi.gameAddWord({
            english: w.english,
            russian: w.russian,
            sourceText: w.english
          });
          savedWords.add(w.english.toLowerCase());
          addBtn.classList.add('saved');
          addBtn.textContent = '✓';
        });
      }
      item.append(addBtn);
      wordList.append(item);
    });
    card.append(wordList);
  }

  cardContainer.append(card);
}

function clearOverlay() {
  cardContainer.textContent = '';
}

function setSavedWords(words) {
  savedWords = new Set(words.map((w) => w.toLowerCase()));
}

window.overlayApi.onGameResult((data) => showResult(data));
window.overlayApi.onGameClear(() => clearOverlay());
window.overlayApi.onGameSavedWords((words) => setSavedWords(words));
window.overlayApi.onGameSetting(({ key, value }) => applyStyle(key, value));
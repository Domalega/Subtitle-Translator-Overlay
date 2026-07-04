const closeWindowButton = document.getElementById('closeWindow');
const originalText = document.getElementById('originalText');
const translatedText = document.getElementById('translatedText');
const translateStatus = document.getElementById('translateStatus');
const copyOriginal = document.getElementById('copyOriginal');
const copyTranslation = document.getElementById('copyTranslation');
const wordChips = document.getElementById('wordChips');
const wordsCard = document.getElementById('wordsCard');
const statusElement = document.getElementById('status');

let savedWords = new Set();

document.body.dataset.theme = localStorage.getItem('subtitle-overlay-theme') || 'green';

window.overlayApi.onApplyUiSetting(({ key, value }) => {
  if (key === 'theme') {
    document.body.dataset.theme = value;
    localStorage.setItem('subtitle-overlay-theme', value);
  }
});

closeWindowButton.addEventListener('click', () => window.overlayApi.closeCurrentWindow());

copyOriginal.addEventListener('click', () => {
  navigator.clipboard.writeText(originalText.textContent);
  statusElement.textContent = 'Original copied';
  statusElement.hidden = false;
  setTimeout(() => { statusElement.hidden = true; }, 1500);
});

copyTranslation.addEventListener('click', () => {
  navigator.clipboard.writeText(translatedText.textContent);
  statusElement.textContent = 'Translation copied';
  statusElement.hidden = false;
  setTimeout(() => { statusElement.hidden = true; }, 1500);
});

function showResult(data) {
  if (!data || !data.original) {
    originalText.textContent = 'No English text found in selection.';
    translatedText.textContent = '-';
    wordsCard.style.display = 'none';
    translateStatus.textContent = 'No text detected';
    return;
  }

  originalText.textContent = data.original;
  translatedText.textContent = data.translation || 'Translating...';
  translateStatus.textContent = new Date().toLocaleTimeString();

  if (data.words && data.words.length > 0) {
    wordsCard.style.display = '';
    wordChips.textContent = '';
    data.words.forEach((w) => {
      const chip = document.createElement('span');
      chip.className = 'wordChip';
      chip.textContent = w.english;

      const addBtn = document.createElement('span');
      addBtn.className = 'chipAdd';
      if (savedWords.has(w.english.toLowerCase())) {
        addBtn.classList.add('saved');
        addBtn.textContent = '\u2713';
      } else {
        addBtn.textContent = '+';
        addBtn.addEventListener('click', async () => {
          addBtn.textContent = '...';
          await window.overlayApi.translateWindowAddWord({
            english: w.english,
            russian: w.russian,
            sourceText: w.english
          });
          savedWords.add(w.english.toLowerCase());
          addBtn.classList.add('saved');
          addBtn.textContent = '\u2713';
        });
      }
      chip.append(addBtn);
      wordChips.append(chip);
    });
  } else {
    wordsCard.style.display = 'none';
  }
}

window.overlayApi.onTranslateResult((data) => showResult(data));
window.overlayApi.onTranslateSavedWords((words) => { savedWords = new Set(words.map((w) => w.toLowerCase())); });
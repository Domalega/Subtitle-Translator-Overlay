(function(root, factory) {
  const english = typeof module === 'object' && module.exports ? require('./locales/en') : root.EnglishMessages;
  const translations = typeof module === 'object' && module.exports ? require('./locales/translations') : root.InterfaceTranslations;
  const api = factory(english, translations);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.I18n = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(english, translations) {
  const catalogs = new Map([['en', Object.freeze(english)]]);
  for (const [id, messages] of Object.entries(translations)) catalogs.set(id, Object.freeze(messages));
  const languages = Object.freeze({en:'English', ru:'Русский', zh:'中文（简体）', hi:'हिन्दी', es:'Español'});
  let locale = 'en';
  function registerLocale(id, messages) {
    if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]+)*$/.test(id) || id === 'en' || !messages || typeof messages !== 'object' || Array.isArray(messages)) return false;
    const safe = Object.fromEntries(Object.entries(messages).filter(([key,value]) => Object.hasOwn(english,key) && typeof value === 'string'));
    catalogs.set(id, Object.freeze(safe));
    return true;
  }
  function t(key, params = {}) {
    const template = catalogs.get(locale)?.[key] ?? english[key] ?? key;
    return template.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? '{'+name+'}'));
  }
  function setLocale(id) { locale = catalogs.has(id) ? id : 'en'; }
  const appliedText = new WeakMap();
  function apply(document) {
    document.documentElement.lang = locale;
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const previous = appliedText.get(el);
      // Runtime output belongs to its renderer; do not overwrite it with a static label.
      if (previous === undefined || el.textContent === previous) {
        el.textContent = t(el.dataset.i18n);
        appliedText.set(el, el.textContent);
      }
    });
    for (const attr of ['title','placeholder','aria-label']) {
      document.querySelectorAll('[data-i18n-'+attr+']').forEach(el => el.setAttribute(attr, t(el.getAttribute('data-i18n-'+attr))));
    }
  }
  return { languages, t, setLocale, registerLocale, apply, get locale() { return locale; } };
});

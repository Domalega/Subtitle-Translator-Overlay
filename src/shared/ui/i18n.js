(function(root, factory) {
  const english = typeof module === 'object' && module.exports ? require('./locales/en') : root.EnglishMessages;
  const api = factory(english);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.I18n = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(english) {
  const catalogs = new Map([['en', Object.freeze(english)]]);
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
  function apply(document) {
    document.documentElement.lang = locale;
    document.querySelectorAll('[data-i18n]').forEach(el => el.textContent = t(el.dataset.i18n));
    for (const attr of ['title','placeholder','aria-label']) {
      document.querySelectorAll('[data-i18n-'+attr+']').forEach(el => el.setAttribute(attr, t(el.getAttribute('data-i18n-'+attr))));
    }
  }
  return { t, setLocale, registerLocale, apply, get locale() { return locale; } };
});

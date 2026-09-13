(() => {
  window.applyInterfaceLocale = (locale) => {
    if (window.I18n.locale === locale && document.documentElement.lang === locale) return;
    window.I18n.setLocale(locale);
    window.I18n.apply(document);
    document.dispatchEvent(new CustomEvent('locale-changed'));
  };
  window.I18n.apply(document);
})();

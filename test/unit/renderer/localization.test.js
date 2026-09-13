'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { rendererHarness } = require('../../helpers/renderer-harness');
const { mainHarness } = require('../../helpers/main-harness');
const { normalizeUiSettings } = require('../../../src/shared/settings/settings-store');
const I18n = require('../../../src/shared/ui/i18n');
const english = require('../../../src/shared/ui/locales/en');
const catalogs = require('../../../src/shared/ui/locales/translations');
const locales = ['en', 'ru', 'zh', 'hi', 'es'];

test('five complete catalogs retain all interpolation placeholders', () => {
  assert.deepEqual(Object.keys(I18n.languages), locales);
  for (const catalog of Object.values(catalogs)) {
    assert.deepEqual(Object.keys(catalog).sort(), Object.keys(english).sort());
    for (const key of Object.keys(english)) {
      assert.equal(typeof catalog[key], 'string');
      assert.ok(catalog[key].trim(), key);
      assert.deepEqual(catalog[key].match(/\{\w+\}/g)?.sort() || [], english[key].match(/\{\w+\}/g)?.sort() || [], key);
    }
  }
});

test('English is the default and unsupported persisted locales fall back to English', () => {
  for (const locale of locales) assert.equal(normalizeUiSettings({locale}).locale, locale);
  for (const locale of [undefined, null, '', 'de', {}, ['ru']]) assert.equal(normalizeUiSettings({locale}).locale, 'en');
  I18n.setLocale('invalid'); assert.equal(I18n.t('settings'), 'Settings');
});

for (const locale of locales) test(`settings loads ${locale}, changes language immediately and resets to English`, async t => {
  const h = rendererHarness(t, 'renderer/settings/settings.html', {
    getUiSettings: async () => normalizeUiSettings({locale}),
    resetUiSettings: async () => normalizeUiSettings()
  });
  await h.flush();
  const select = h.document.getElementById('localeSelect');
  assert.equal(select.options.length, 5);
  assert.equal(select.value, locale);
  assert.equal(h.document.documentElement.lang, locale);
  assert.equal(h.document.title, (catalogs[locale] || english).settings);
  select.value = 'ru'; select.dispatchEvent(new h.window.Event('change')); await h.flush();
  assert.ok(h.calls.some(([method,key,value]) => method === 'setUiSetting' && key === 'locale' && value === 'ru'));
  assert.equal(h.document.title, 'Настройки');
  assert.equal(h.document.querySelector('#themeSelect option').textContent, 'Тёмная');
  h.document.getElementById('confirmReset').click(); await h.flush();
  assert.equal(select.value, 'en'); assert.equal(h.document.title, 'Settings');
  assert.deepEqual(h.errors, []);
});

test('failed language save restores persisted selection and text', async t => {
  const h = rendererHarness(t, 'renderer/settings/settings.html', {setUiSetting: async () => false});
  await h.flush();
  const select = h.document.getElementById('localeSelect'); select.value='ru';
  select.dispatchEvent(new h.window.Event('change')); await h.flush();
  assert.equal(select.value,'en'); assert.equal(h.document.title,'Settings');
  assert.match(h.document.getElementById('status').textContent, /Could not save/);
});

test('main window switches labels and accessibility text without losing results or running state', async t => {
  const h = rendererHarness(t, 'renderer/main/index.html'); await h.flush();
  h.evaluate("englishTextElement.textContent='Original result'; russianTextElement.textContent='Сохранённый перевод'; hasOcrArea=true; isOcrRunning=true; updateControls()");
  for (const locale of locales) {
    h.events.onApplyUiSetting({key:'locale',value:locale}); await h.flush();
    const messages=catalogs[locale] || english;
    assert.equal(h.document.documentElement.lang,locale);
    assert.equal(h.document.getElementById('settingsToggle').getAttribute('aria-label'),messages.settings);
    assert.equal(h.document.getElementById('playPause').textContent,messages['stop.translation']);
    assert.equal(h.document.getElementById('englishText').getAttribute('aria-label'),messages['original.text']);
    assert.equal(h.document.getElementById('englishText').textContent,'Original result');
    assert.equal(h.document.getElementById('russianText').textContent,'Сохранённый перевод');
    assert.equal(h.evaluate('isOcrRunning'),true);
  }
  assert.deepEqual(h.errors,[]);
});

test('dictionary updates search placeholder and dynamically rendered empty state', async t => {
  const h=rendererHarness(t,'renderer/dictionary/dictionary.html'); await h.flush();
  h.events.onApplyUiSetting({key:'locale',value:'es'}); await h.flush();
  assert.equal(h.document.title,'Diccionario');
  assert.ok(h.document.body.textContent.includes(catalogs.es['no.words.yet.select.text.in.the.translation.window.then.choose.ad']));
  assert.equal(h.document.querySelector('[data-i18n-placeholder]').placeholder,catalogs.es['search.words.or.translations']);
  assert.deepEqual(h.errors,[]);
});

for(const name of ['select','capture-select']) test(`${name} opens in saved language`,async t=>{
  const h=rendererHarness(t,`renderer/capture/${name}.html`,{getUiSettings:async()=>normalizeUiSettings({locale:'hi'})});await h.flush();
  assert.equal(h.document.documentElement.lang,'hi');assert.deepEqual(h.errors,[]);
});

test('language persists on disk, broadcasts to open windows, and reset restores English',async t=>{
  const h=mainHarness(t,{settings:{locale:'es'}});
  assert.equal((await h.invoke('get-ui-settings')).locale,'es');
  await h.invoke('open-settings-window');await h.invoke('open-dictionary-window');
  assert.equal(await h.invoke('set-ui-setting','locale','ru'),true);
  assert.equal((await h.invoke('get-ui-settings')).locale,'ru');
  assert.equal(JSON.parse(fs.readFileSync(path.join(h.folder,'ui-settings.json'),'utf8')).locale,'ru');
  for(const window of h.windows.filter(w=>!w.destroyed)) assert.ok(window.messages.some(([channel,payload])=>channel==='apply-ui-settings'&&payload.locale==='ru'&&payload.targetLanguage==='ru'));
  assert.equal((await h.invoke('reset-ui-settings')).locale,'en');
});

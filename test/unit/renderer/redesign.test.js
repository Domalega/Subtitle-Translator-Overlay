'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {rendererHarness}=require('../../helpers/renderer-harness');
const {mainHarness}=require('../../helpers/main-harness');
const {normalizeUiSettings}=require('../../../src/shared/settings/settings-store');
const Themes=require('../../../src/shared/settings/themes');
const I18n=require('../../../src/shared/ui/i18n');
const click=(h,id)=>h.document.getElementById(id).click();
const key=(h,id,options)=>h.document.getElementById(id).dispatchEvent(new h.window.KeyboardEvent('keydown',{bubbles:true,cancelable:true,...options}));

test('exactly two shipped themes migrate old choices and validate future theme data',()=>{
  assert.deepEqual(Object.keys(Themes.registry),['dark','light']);
  for(const old of ['nothing','nothing-os-light'])assert.equal(normalizeUiSettings({theme:old}).theme,'light');
  for(const old of ['green','blue','purple','nothing-dark','nothing-os-dark','missing'])assert.equal(normalizeUiSettings({theme:old}).theme,'dark');
  const custom=Themes.resolve({id:'custom-test',base:'light',name:'Custom',tokens:{accent:'#123456',text:'url(bad)',unknown:'#123456'}});
  assert.equal(custom.id,'custom-test');assert.equal(custom.tokens.accent,'#123456');assert.equal(custom.tokens.text,Themes.registry.light.tokens.text);assert.equal(custom.tokens.unknown,undefined);
  assert.equal(Themes.resolve().base,'dark');
});
test('locale catalogs extend independently and missing translations fall back to English',()=>{
  assert.equal(I18n.registerLocale('test',{ready:'Prepared','page.count':'{current} of {total}',unknown:'ignored'}),false);
  assert.equal(I18n.registerLocale('fr',{ready:'Prêt','page.count':'{current} sur {total}',unknown:'ignored'}),true);
  I18n.setLocale('fr');assert.equal(I18n.t('ready'),'Prêt');assert.equal(I18n.t('page.count',{current:2,total:4}),'2 sur 4');assert.equal(I18n.t('close'),'Close');
  assert.equal(I18n.t('unknown'),'unknown');assert.match(I18n.t('page.count'),/\{current\}/);
  I18n.setLocale('missing');assert.equal(I18n.locale,'en');assert.equal(I18n.registerLocale('en',{}),false);assert.equal(I18n.registerLocale('ru',[]),false);
});
test('cancelled one-shot capture resumes only a previously running subtitle session',async t=>{
  const h=rendererHarness(t,'renderer/main/index.html');await h.flush();
  h.evaluate("hasOcrArea=true; isOcrRunning=true; screenOcrCoordinator.start=()=>{isOcrRunning=true;updateControls()}; englishTextElement.textContent='Previous original'; russianTextElement.textContent='Previous result'");
  click(h,'captureTranslate');await h.flush();assert.equal(h.evaluate('isOcrRunning'),false);assert.equal(h.evaluate('capturePending'),true);
  await h.events.onCaptureResult({cancelled:true});await h.flush();assert.equal(h.evaluate('isOcrRunning'),true);assert.equal(h.document.getElementById('russianText').textContent,'Previous result');
  h.evaluate('isOcrRunning=false');click(h,'captureTranslate');await h.flush();await h.events.onCaptureResult({cancelled:true});await h.flush();assert.equal(h.evaluate('isOcrRunning'),false);
});
test('successful capture stays readable until explicit resume; stale events are ignored',async t=>{
  const h=rendererHarness(t,'renderer/main/index.html');await h.flush();
  h.evaluate('hasOcrArea=true;isOcrRunning=true;screenOcrCoordinator.start=()=>{isOcrRunning=true;updateControls()}');
  h.events.onCaptureRequested();await h.flush();await h.events.onCaptureResult({original:'New original',translation:'New result'});
  assert.equal(h.evaluate('isOcrRunning'),false);assert.equal(h.document.getElementById('resumeTranslation').hidden,false);
  await h.events.onCaptureResult({original:'Stale',translation:'Stale'});assert.equal(h.document.getElementById('russianText').textContent,'New result');
  click(h,'resumeTranslation');await h.flush();assert.equal(h.evaluate('isOcrRunning'),true);assert.equal(h.evaluate('isGameMode'),false);
});
test('busy capture restores previous state and exposes a retry message',async t=>{
  const h=rendererHarness(t,'renderer/main/index.html',{startCaptureTranslate:async()=>false});await h.flush();
  click(h,'captureTranslate');await h.flush();assert.equal(h.evaluate('capturePending'),false);assert.equal(h.evaluate('isGameMode'),false);assert.match(h.document.getElementById('actionStatus').textContent,/busy/);
});
test('capture errors and empty recognition retain the last result and enable retry',async t=>{
  const h=rendererHarness(t,'renderer/main/index.html');await h.flush();h.evaluate("russianTextElement.textContent='Keep this result'");
  for(const result of [{error:'Service unavailable'},{original:'',translation:''}]){
    click(h,'captureTranslate');await h.flush();await h.events.onCaptureResult(result);
    assert.equal(h.document.getElementById('russianText').textContent,'Keep this result');assert.equal(h.document.getElementById('captureTranslate').disabled,false);assert.equal(h.document.getElementById('actionStatus').hidden,false);
  }
});
test('Escape cancels editing and late manual translation cannot overwrite restored text',async t=>{
  let resolve;const h=rendererHarness(t,'renderer/main/index.html',{translate:()=>new Promise(done=>resolve=done)});await h.flush();
  h.evaluate("englishTextElement.textContent='Original';russianTextElement.textContent='Previous';updateControls()");click(h,'editOriginal');h.document.getElementById('englishText').textContent='Edited';click(h,'retranslateButton');
  key(h,'englishText',{key:'Escape'});resolve('Late answer');await h.flush();
  assert.equal(h.document.getElementById('englishText').textContent,'Original');assert.equal(h.document.getElementById('russianText').textContent,'Previous');assert.equal(h.evaluate('editing'),false);
});
test('failed edit translation keeps edits and allows retry; empty edits explain the next step',async t=>{
  const h=rendererHarness(t,'renderer/main/index.html',{translate:async()=>{throw Error('offline')}});await h.flush();h.evaluate("englishTextElement.textContent='Original';updateControls()");click(h,'editOriginal');click(h,'retranslateButton');await h.flush();
  assert.equal(h.evaluate('editing'),true);assert.match(h.document.getElementById('actionStatus').textContent,/retry/);assert.equal(h.document.getElementById('retranslateButton').disabled,false);
  h.document.getElementById('englishText').textContent='';click(h,'retranslateButton');assert.match(h.document.getElementById('actionStatus').textContent,/Enter/);
});
test('failed settings write restores persisted values and remains visible',async t=>{
  const h=rendererHarness(t,'renderer/settings/settings.html',{setUiSetting:async()=>{throw Error('disk full')}});await h.flush();
  const select=h.document.getElementById('themeSelect');select.value='light';select.dispatchEvent(new h.window.Event('change'));await h.flush();
  assert.equal(select.value,'dark');assert.match(h.document.getElementById('status').textContent,/disk full/);assert.equal(h.document.getElementById('status').hidden,false);
  h.window.dispatchEvent(new h.window.Event('resize'));assert.equal(h.document.getElementById('status').hidden,false);
});
test('shortcut conflicts restore the active shortcut; ordinary typing cannot silently set one',async t=>{
  const h=rendererHarness(t,'renderer/settings/settings.html',{setGameHotkey:async()=>false});await h.flush();
  key(h,'gameHotkey',{key:'A'});assert.match(h.document.getElementById('status').textContent,/Ctrl or Alt/);
  key(h,'gameHotkey',{key:'K',ctrlKey:true});await h.flush();assert.equal(h.document.getElementById('gameHotkey').value,'Ctrl+Shift+T');assert.match(h.document.getElementById('status').textContent,/unavailable/);
  key(h,'gameHotkey',{key:'Escape'});key(h,'gameHotkey',{key:'Control'});key(h,'gameHotkey',{key:'Tab'});
});
test('settings sections and reset dialog preserve keyboard navigation',async t=>{
  const h=rendererHarness(t,'renderer/settings/settings.html');await h.flush();
  h.document.querySelector('[data-settings-section=appearance]').click();assert.equal(h.document.querySelector('[data-settings-panel=appearance]').hidden,false);assert.equal(h.document.querySelector('[data-settings-panel=translation]').hidden,true);
  h.document.querySelector('[data-settings-section=advanced]').click();const trigger=h.document.getElementById('resetDefaults');trigger.focus();click(h,'resetDefaults');
  assert.equal(h.document.activeElement.id,'cancelReset');key(h,'cancelReset',{key:'Tab',shiftKey:true});assert.equal(h.document.activeElement.id,'confirmReset');key(h,'confirmReset',{key:'Tab'});assert.equal(h.document.activeElement.id,'cancelReset');
  key(h,'cancelReset',{key:'Escape'});assert.equal(h.document.getElementById('resetModal').classList.contains('show'),false);assert.equal(h.document.activeElement,trigger);assert.equal(h.document.querySelector('.settingsContent').inert,false);
});
test('reset failure is actionable and leaves the UI usable',async t=>{
  const h=rendererHarness(t,'renderer/settings/settings.html',{resetUiSettings:async()=>{throw Error('disk full')}});await h.flush();click(h,'resetDefaults');click(h,'confirmReset');await h.flush();assert.match(h.document.getElementById('status').textContent,/disk full/);assert.equal(h.document.getElementById('confirmReset').disabled,false);
});
test('review ends once, export failure stays in its dialog, and long entries page predictably',async t=>{
  const entries=Array.from({length:21},(_,i)=>({id:String(i),english:'Word '+i,russian:'Translation '.repeat(20),addedAt:i}));
  const h=rendererHarness(t,'renderer/dictionary/dictionary.html',{dictionaryGet:async()=>entries,exportDictionary:async()=>{throw Error('disk full')}});await h.flush();
  assert.equal(h.document.querySelectorAll('.dictionaryItem').length,20);click(h,'dictionaryNext');await h.flush();assert.equal(h.document.querySelectorAll('.dictionaryItem').length,1);
  click(h,'studyButton');await h.flush();for(let i=0;i<21;i++){click(h,'showTranslationBtn');click(h,'studyNextBtn');}assert.equal(h.document.getElementById('studyWord').textContent,'Review complete');assert.equal(h.document.getElementById('studyNextBtn').style.display,'none');click(h,'closeStudyModal');
  click(h,'exportButton');click(h,'exportCsvBtn');await h.flush();assert.equal(h.document.getElementById('exportModal').classList.contains('show'),true);assert.match(h.document.getElementById('exportStatus').textContent,/disk full/);assert.equal(h.document.getElementById('exportCsvBtn').disabled,false);
});
test('reset persists one coherent settings object and preserves dictionary and area',async t=>{
  const h=mainHarness(t,{settings:{theme:'light',fontScale:130,ocrArea:{x:1,y:2,width:100,height:30}}});await h.invoke('dictionary-add',{english:'keep'});
  const settings=await h.invoke('reset-ui-settings');assert.equal(settings.theme,'dark');assert.equal(settings.fontScale,100);assert.equal(settings.ocrArea.width,100);assert.equal((await h.invoke('dictionary-get')).length,1);
  assert.equal(await h.invoke('restore-window-size'),true);assert.equal(h.invoke('minimize-window'),true);assert.equal(h.invoke('quit-app'),true);
});
test('capture shortcut requests the interaction without requiring a game mode',async t=>{
  const h=mainHarness(t);h.shortcuts.get('CommandOrControl+Shift+T')();assert.ok(h.windows[0].messages.some(([channel])=>channel==='capture-requested'));
  assert.equal(h.invoke('start-capture-translate'),true);h.invoke('cancel-capture-translate');assert.ok(h.windows[0].messages.some(([channel,payload])=>channel==='capture-result'&&payload.cancelled));
});

test('main hides shortcut hints and gates translation status on developer mode',async t=>{
  const h=rendererHarness(t,'renderer/main/index.html'); await h.flush();
  assert.equal(h.document.getElementById('captureHotkey'),null);
  assert.equal(h.document.getElementById('status').hidden,true);
  h.events.onApplyUiSetting({key:'developerMode',value:true}); assert.equal(h.document.getElementById('status').hidden,false);
  h.events.onApplyUiSetting({key:'developerMode',value:false}); assert.equal(h.document.getElementById('status').hidden,true);
  h.evaluate("notify('Could not translate this area')"); assert.equal(h.document.getElementById('actionStatus').hidden,false);
});

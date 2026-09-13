'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('fs');const path=require('path');
const {mainHarness}=require('../../helpers/main-harness');const {rendererHarness}=require('../../helpers/renderer-harness');const {normalizeUiSettings}=require('../../../src/shared/settings/settings-store');
const locales=['en','ru','zh','hi','es'];
test('translation settings preserve old Russian default and validate all targets',()=>{
 assert.equal(normalizeUiSettings({locale:'es'}).targetLanguage,'ru');
 for(const targetLanguage of locales)assert.equal(normalizeUiSettings({targetLanguage}).targetLanguage,targetLanguage);
 for(const targetLanguage of ['xx',null,{},'zh-CN'])assert.equal(normalizeUiSettings({targetLanguage}).targetLanguage,'ru');
});
test('locale and target persist atomically, target can diverge, invalid targets are rejected',async t=>{
 const h=mainHarness(t);
 for(const locale of locales){await h.invoke('set-ui-setting','locale',locale);const s=JSON.parse(fs.readFileSync(path.join(h.folder,'ui-settings.json')));assert.equal(s.locale,locale);assert.equal(s.targetLanguage,locale);}
 await h.invoke('set-ui-setting','targetLanguage','hi');assert.equal((await h.invoke('get-ui-settings')).locale,'es');
 assert.equal(await h.invoke('set-ui-setting','targetLanguage','xx'),false);assert.equal((await h.invoke('get-ui-settings')).targetLanguage,'hi');
 const reset=await h.invoke('reset-ui-settings');assert.equal(reset.locale,'en');assert.equal(reset.targetLanguage,'ru');
});
test('subtitle/manual and capture translation use the selected target; English needs no network',async t=>{
 const queries=[];const h=mainHarness(t,{fetch:async url=>{const q=new URL(url).searchParams;queries.push(q.get('tl'));return {ok:true,json:async()=>[[['result-'+q.get('tl')]]]};}});
 for(const language of ['ru','zh','hi','es']){
   await h.invoke('set-ui-setting','targetLanguage',language);const expected=language==='zh'?'zh-CN':language;
   assert.equal(await h.invoke('translate','Same text','screen-ocr'),'result-'+expected);
   assert.equal(await h.invoke('translate','Edited text','manual'),'result-'+expected);
   assert.equal(await h.evaluate("translateToSelectedLanguage('Captured text','game')"),'result-'+expected);
 }
 assert.ok(queries.includes('zh-CN'));assert.ok(queries.includes('hi'));assert.ok(queries.includes('es'));
 await h.invoke('set-ui-setting','targetLanguage','en');const count=queries.length;assert.equal(await h.invoke('translate','Unchanged original'),'Unchanged original');assert.equal(queries.length,count);
});
test('a pending old-language result cannot escape after a target change',async t=>{
 let resolve;const h=mainHarness(t,{fetch:()=>new Promise(r=>resolve=r)});
 const pending=h.invoke('translate','Pending source','manual');const rejected=assert.rejects(pending,/cancelled|language changed/);
 await h.invoke('set-ui-setting','locale','es');resolve({ok:true,json:async()=>[[['Старый перевод']]]});await rejected;
});
test('settings selectors synchronize on locale change and save target independently',async t=>{
 const h=rendererHarness(t,'renderer/settings/settings.html');await h.flush();
 const locale=h.document.getElementById('localeSelect'),target=h.document.getElementById('targetLanguageSelect');assert.equal(target.options.length,5);assert.equal(target.value,'ru');
 locale.value='zh';locale.dispatchEvent(new h.window.Event('change'));await h.flush();assert.equal(target.value,'zh');
 target.value='hi';target.dispatchEvent(new h.window.Event('change'));await h.flush();assert.equal(locale.value,'zh');assert.ok(h.calls.some(([m,k,v])=>m==='setUiSetting'&&k==='targetLanguage'&&v==='hi'));
 h.events.onApplyUiSettings(normalizeUiSettings({locale:'es',targetLanguage:'es'}));assert.equal(target.value,'es');
});
test('switching targets separates caches and retires an old renderer result',async t=>{
 const pending=[];const h=rendererHarness(t,'renderer/main/index.html',{translate:()=>new Promise(resolve=>pending.push(resolve))});await h.flush();
 h.evaluate("setCachedTranslation('some subtitle','Русский'); englishTextElement.textContent='some subtitle'; russianTextElement.textContent='Русский'");
 h.events.onApplyUiSetting({key:'targetLanguage',value:'es'});await h.flush();assert.equal(h.evaluate("getCachedTranslation('some subtitle')"),null);assert.match(h.document.getElementById('translationHeading').textContent,/Español/);
 h.events.onApplyUiSetting({key:'targetLanguage',value:'hi'});await h.flush();pending[0]('Español viejo');pending[1]('हिन्दी');await h.flush();assert.equal(h.document.getElementById('russianText').textContent,'हिन्दी');assert.equal(h.document.getElementById('englishText').textContent,'some subtitle');
 assert.deepEqual(h.errors,[]);
});
test('dictionary preserves translation language and allows separate translations of a word',async t=>{
 const h=mainHarness(t);await h.invoke('dictionary-add',{english:'hello',russian:'привет'});
 const added=await h.invoke('dictionary-add',{english:'hello',russian:'hola',targetLanguage:'es'});assert.equal(added.added,true);
 const duplicate=await h.invoke('dictionary-add',{english:'hello',russian:'hola',targetLanguage:'es'});assert.equal(duplicate.duplicate,true);
 const entries=await h.invoke('dictionary-get');assert.equal(entries[0].targetLanguage,'ru');assert.equal(entries[1].targetLanguage,'es');
});

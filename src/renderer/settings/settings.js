const $ = id => document.getElementById(id);
const statusElement = $('status');
$('themeSelect').replaceChildren(...Object.values(window.Themes.registry).map(theme=>{ const option=document.createElement('option'); option.value=theme.id; option.textContent=theme.labelKey ? window.I18n.t(theme.labelKey) : theme.name; return option; }));
let savedSettings = {}, uiSettingSaveQueue = Promise.resolve();
const numericKeys = ['fontScale','contextCount','nearSourceFontSize','nearSourceVerticalOffset','nearSourceMaxWidth','nearSourceMaxLines'];
const checkboxKeys = ['deleteConfirm','developerMode'];
const controls = { theme:'themeSelect', font:'fontSelect', fontScale:'fontScale', displayMode:'displayMode', nearSourcePlacement:'nearSourcePlacement', nearSourceFontSize:'nearSourceFontSize', nearSourceVerticalOffset:'nearSourceVerticalOffset', nearSourceMaxWidth:'nearSourceMaxWidth', nearSourceMaxLines:'nearSourceMaxLines', nearSourceBackgroundOpacity:'nearSourceBackgroundOpacity', deleteConfirm:'deleteConfirmToggle', developerMode:'developerModeToggle', contextCount:'contextCountSelect' };
function setStatus(message, error=false) { statusElement.textContent=message; statusElement.hidden=!message; statusElement.classList.toggle('notice',error); }
function applySettings(settings) {
  savedSettings={...settings};
  window.Appearance.apply(settings);
  window.Themes.apply(document,settings.theme); document.body.dataset.theme=window.Themes.normalizeId(settings.theme);
  for(const [key,id] of Object.entries(controls)) { if(settings[key]===undefined) continue; if(checkboxKeys.includes(key)) $(id).checked=settings[key]; else $(id).value=key==='nearSourceBackgroundOpacity' ? Math.round(settings[key]*100) : settings[key]; }
  $('gameHotkey').value=(settings.hotkey || 'CommandOrControl+Shift+T').replace('CommandOrControl','Ctrl');
  document.dispatchEvent(new CustomEvent('developer-mode-changed',{detail:{enabled:settings.developerMode===true}}));
  updatePreview();
}
function updatePreview() {
  $('nearSourceSettings').hidden=$('displayMode').value==='panel';
  for(const key of ['fontScale','nearSourceFontSize','nearSourceVerticalOffset','nearSourceMaxWidth','nearSourceMaxLines','nearSourceBackgroundOpacity']) $(key+'Value').textContent=$(key).value+(key==='nearSourceMaxLines' ? '' : key==='fontScale'||key==='nearSourceBackgroundOpacity' ? '%' : ' px');
  const preview=$('subtitlePreview'); preview.style.fontSize=$('nearSourceFontSize').value+'px';
  const opacity=Number($('nearSourceBackgroundOpacity').value)/100;
  preview.style.background='rgba(16,20,26,'+opacity+')'; preview.style.maxWidth=$('nearSourceMaxWidth').value+'px';
  preview.style.display='-webkit-box'; preview.style.webkitBoxOrient='vertical'; preview.style.webkitLineClamp=$('nearSourceMaxLines').value;
  preview.style.marginBlock=$('nearSourceVerticalOffset').value+'px';
}
function setUiSettingQueued(key,value) {
  uiSettingSaveQueue=uiSettingSaveQueue.then(async()=>{
    try { if(!await window.overlayApi.setUiSetting(key,value)) throw new Error(window.I18n.t("setting.was.not.saved")); savedSettings[key]=value; }
    catch(error) { applySettings(await window.overlayApi.getUiSettings().catch(()=>savedSettings)); setStatus(window.I18n.t("could.not.save.settings")+error.message,true); return false; }
    return true;
  }); return uiSettingSaveQueue;
}
for(const [key,id] of Object.entries(controls)) {
  const input=$(id);
  input.addEventListener(input.type==='range'?'input':'change',()=>{
    updatePreview(); const value=checkboxKeys.includes(key)?input.checked:key==='nearSourceBackgroundOpacity'?Number(input.value)/100:numericKeys.includes(key)?Number(input.value):input.value;
    // Range controls preview continuously and persist once at the end of the gesture.
    if(input.type!=='range') setUiSettingQueued(key,value);
  });
  if(input.type==='range') input.addEventListener('change',()=>setUiSettingQueued(key,key==='nearSourceBackgroundOpacity'?Number(input.value)/100:Number(input.value)));
}
$('gameHotkey').addEventListener('keydown',async event=>{
  if(event.key==='Tab') return; event.preventDefault();
  if(event.key==='Escape') { $('gameHotkey').value=(savedSettings.hotkey||'CommandOrControl+Shift+T').replace('CommandOrControl','Ctrl'); $('gameHotkey').blur(); return; }
  if(['Control','Alt','Shift','Meta'].includes(event.key)) return;
  if(!event.ctrlKey&&!event.altKey) { setStatus(window.I18n.t("use.ctrl.or.alt.together.with.a.letter.number.or.function.key"),true); return; }
  const key=event.key.length===1?event.key.toUpperCase():event.key;
  const accelerator=[event.ctrlKey?'Control':null,event.altKey?'Alt':null,event.shiftKey?'Shift':null,key].filter(Boolean).join('+');
  try { if(!await window.overlayApi.setGameHotkey(accelerator)) throw new Error(window.I18n.t("this.shortcut.is.unavailable.choose.another")); savedSettings.hotkey=accelerator; $('gameHotkey').value=accelerator.replace('Control','Ctrl'); setStatus(window.I18n.t("shortcut.saved")); }
  catch(error) { $('gameHotkey').value=(savedSettings.hotkey||'CommandOrControl+Shift+T').replace('CommandOrControl','Ctrl'); setStatus(error.message,true); }
});
$('closeWindow').addEventListener('click',()=>window.overlayApi.closeCurrentWindow());
$('selectOcrArea').addEventListener('click',()=>window.overlayApi.selectOcrArea().catch(error=>setStatus(error.message,true)));
$('restoreSize').addEventListener('click',()=>window.overlayApi.restoreWindowSize().then(()=>setStatus(window.I18n.t("window.size.and.position.restored"))).catch(error=>setStatus(error.message,true)));
$('resetDefaults').addEventListener('click',()=>window.Dialogs.show($('resetModal')));
$('cancelReset').addEventListener('click',()=>window.Dialogs.hide($('resetModal')));
$('confirmReset').addEventListener('click',async()=>{
  $('confirmReset').disabled=true;
  try { await uiSettingSaveQueue; const settings=await window.overlayApi.resetUiSettings(); applySettings(settings); window.Dialogs.hide($('resetModal')); setStatus(window.I18n.t("settings.restored.your.dictionary.was.kept")); }
  catch(error) { window.Dialogs.hide($('resetModal')); setStatus(window.I18n.t("could.not.reset.settings")+error.message,true); }
  finally { $('confirmReset').disabled=false; }
});
window.overlayApi.onApplyUiSetting(({key,value})=>applySettings({...savedSettings,[key]:value}));
window.overlayApi.onApplyUiSettings(applySettings);
window.uiReady.then(applySettings);

const sectionButtons=[...document.querySelectorAll('[data-settings-section]')];
sectionButtons.forEach(button=>button.addEventListener('click',()=>{
  sectionButtons.forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
  document.querySelectorAll('[data-settings-panel]').forEach(panel=>panel.hidden=panel.dataset.settingsPanel!==button.dataset.settingsSection);
  document.querySelector('.settingsContent').scrollTop=0;
}));

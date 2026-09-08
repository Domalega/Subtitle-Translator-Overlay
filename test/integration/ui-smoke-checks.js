'use strict';
const fs=require('node:fs');const path=require('node:path');
async function runUiSmokeTest({app,mainWindow,createToolWindow,createSelectionWindow,createCaptureWindow,createNearSourceWindow,getSelectionWindow,getCaptureWindow}) {
  const failures=[];
  const screenshotRoot=path.resolve(__dirname,'../../.agent/tmp/ui-preview');fs.mkdirSync(screenshotRoot,{recursive:true});
  const loaded=win=>new Promise((resolve,reject)=>{ if(!win.webContents.isLoading())return resolve();win.webContents.once('did-finish-load',resolve);win.webContents.once('did-fail-load',(_e,_code,message)=>reject(Error(message))); });
  const evaluate=async(win,code)=>{let timer;try{return await Promise.race([(async()=>{await loaded(win);if(!win.webContents.debugger.isAttached())win.webContents.debugger.attach('1.3');const reply=await win.webContents.debugger.sendCommand('Runtime.evaluate',{expression:code,awaitPromise:true,returnByValue:true});if(reply.exceptionDetails)throw Error(JSON.stringify(reply.exceptionDetails));return reply.result.value})(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('UI evaluation timed out: '+code.slice(0,120))),7000)})]);}finally{clearTimeout(timer)}};
  const watch=(win,name)=>{win.webContents.on('console-message',({level,message})=>{if(level==='error')failures.push(name+': '+message)});};
  const settle=()=>new Promise(resolve=>setTimeout(resolve,100));
  const screenshot=async(win,name)=>{console.log('UI preview: '+name);await settle();win.hide();fs.writeFileSync(path.join(screenshotRoot,name+'.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());win.showInactive();};
  const check=(ok,message)=>{if(!ok)failures.push(message);};
  try {
    watch(mainWindow,'main');mainWindow.setPosition(-10000,-10000);mainWindow.showInactive();await loaded(mainWindow);await settle();
    check(await evaluate(mainWindow,"document.documentElement.lang==='en' && !document.getElementById('gameModeToggle') && !document.getElementById('focusToggle') && !document.getElementById('developerTools')"),'Removed modes or diagnostics remain in main UI');
    check(await evaluate(mainWindow,"!document.getElementById('captureHotkey') && document.getElementById('status').hidden && getComputedStyle(document.querySelector('.footer')).display==='none'"),'Main status or hotkey is visible outside developer mode');
    await evaluate(mainWindow,"window.overlayApi.setUiSetting('developerMode',true)"); await settle();
    check(await evaluate(mainWindow,"!document.getElementById('status').hidden && getComputedStyle(document.querySelector('.footer')).display!=='none'"),'Developer mode did not reveal status');
    await evaluate(mainWindow,"window.overlayApi.setUiSetting('developerMode',false)"); await settle();
    await screenshot(mainWindow,'main-first-run-dark');
    const settings=createToolWindow('renderer/settings/settings.html','Settings',600,760);
    const dictionary=createToolWindow('renderer/dictionary/dictionary.html','Dictionary',720,620);
    for(const [win,name] of [[settings,'settings'],[dictionary,'dictionary']]){watch(win,name);win.setPosition(-10000,-10000);win.showInactive();await loaded(win);}
    check(await evaluate(settings,"JSON.stringify([...document.getElementById('themeSelect').options].map(x=>x.value))===JSON.stringify(['dark','light'])"),'Theme picker must have exactly dark and light');
    await evaluate(settings,"document.getElementById('displayMode').value='both';document.getElementById('displayMode').dispatchEvent(new Event('change'));uiSettingSaveQueue");
    await evaluate(settings,"document.querySelector('[data-settings-section=display]').click()");await screenshot(settings,'settings-dark');
    for(const theme of ['light','dark']){
      await evaluate(settings,`document.getElementById('themeSelect').value='${theme}';document.getElementById('themeSelect').dispatchEvent(new Event('change'));uiSettingSaveQueue`);await settle();
      for(const [win,name] of [[mainWindow,'main'],[settings,'settings'],[dictionary,'dictionary']])check(await evaluate(win,`document.documentElement.dataset.theme==='${theme}'`),name+' did not adopt '+theme);
      await screenshot(settings,'settings-'+theme);await evaluate(settings,"document.querySelector('[data-settings-section=appearance]').click()");await screenshot(settings,'appearance-'+theme);await evaluate(settings,"document.querySelector('[data-settings-section=display]').click()");
      await evaluate(mainWindow,"document.getElementById('welcome').hidden=true;document.getElementById('englishText').textContent='There is always another way to see the world.';document.getElementById('russianText').textContent='Всегда есть другой способ увидеть мир.';document.getElementById('originalDetails').open=false;hasOcrArea=true;document.getElementById('areaStatus').textContent='Subtitle area selected';updateControls()");
      await screenshot(mainWindow,'main-'+theme);
      mainWindow.setSize(620,260);await settle();
      check(await evaluate(mainWindow,"document.documentElement.scrollWidth <= innerWidth && document.querySelector('.workspace').clientHeight>50 && document.getElementById('playPause').getBoundingClientRect().width>0"),'Minimum main size loses controls');
      await screenshot(mainWindow,'main-small-'+theme);mainWindow.setSize(980,360);
    }
    // Cancel a real selection window; text and controller state must survive.
    await evaluate(mainWindow,"document.getElementById('captureTranslate').click()");await settle();
    check(await evaluate(mainWindow,"capturePending && document.getElementById('playPause').disabled"),'Capture did not pause controls');
    const capture=getCaptureWindow();check(Boolean(capture),'Capture window was not created');
    if(capture)await evaluate(mainWindow,'window.overlayApi.cancelCaptureTranslate()');await settle();
    check(await evaluate(mainWindow,"!capturePending && document.getElementById('russianText').textContent==='Всегда есть другой способ увидеть мир.'"),'Cancel lost previous translation');
    // Rendering a long result must keep every line reachable.
    await evaluate(mainWindow,"document.getElementById('russianText').textContent='A long translated line. '.repeat(150);document.getElementById('originalDetails').open=true");
    check(await evaluate(mainWindow,"getComputedStyle(document.querySelector('.subtitleBox')).overflowY==='auto' && document.querySelector('.subtitleBox').scrollHeight>document.querySelector('.subtitleBox').clientHeight"),'Long results are not scrollable');
    await evaluate(mainWindow,"Promise.all(Array.from({length:23},(_,i)=>window.overlayApi.dictionaryAdd({english:'Example word '+i,russian:'Пример перевода '+i})))");await settle();
    check(await evaluate(dictionary,"document.querySelectorAll('.dictionaryItem').length===20 && !document.getElementById('dictionaryNext').disabled"),'Dictionary paging failed');
    await screenshot(dictionary,'dictionary-dark');
    await evaluate(dictionary,"document.getElementById('studyButton').click()");await settle();
    check(await evaluate(dictionary,"document.getElementById('studyModal').getAttribute('role')==='dialog' && document.getElementById('studyModal').contains(document.activeElement)"),'Review dialog focus failed');
    await screenshot(dictionary,'review-dark');
    await evaluate(dictionary,"document.getElementById('closeStudyModal').click()");
    await evaluate(settings,"document.getElementById('resetDefaults').click()");await settle();
    check(await evaluate(settings,"document.getElementById('resetModal').classList.contains('show') && document.querySelector('.settingsContent').inert"),'Reset confirmation did not isolate focus');
    await evaluate(settings,"document.getElementById('cancelReset').click()");
    for(const create of [createSelectionWindow,createCaptureWindow]) create();
    for(const win of [getSelectionWindow(),getCaptureWindow(),createNearSourceWindow()]){
      watch(win,'auxiliary');check(await evaluate(win,"typeof require==='undefined' && Boolean(window.overlayApi)"),'Auxiliary isolation failed');
    }
    settings.close();await settle();const reopened=createToolWindow('renderer/settings/settings.html','Settings',600,760);await loaded(reopened);await settle();
    check(await evaluate(reopened,"document.getElementById('themeSelect').value==='dark' && document.getElementById('displayMode').value==='both'"),'Settings did not persist after reopen');
  }catch(error){failures.push(error.stack||error.message);}
  if(failures.length){console.error('UI smoke test failed:\n'+failures.join('\n'));app.exit(1);}else{console.log('UI smoke test passed. Previews: '+screenshotRoot);app.exit(0);}
}
module.exports={runUiSmokeTest};

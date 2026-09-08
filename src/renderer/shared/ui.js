(() => {
  const api = window.overlayApi;
  window.Appearance = { apply(settings) {
    if(settings.theme) window.Themes.apply(document,settings.theme);
    if(settings.font) document.body.style.fontFamily=({system:'"Segoe UI", Arial, sans-serif',inter:'Inter, "Segoe UI", sans-serif','segoe ui':'"Segoe UI", sans-serif',arial:'Arial, sans-serif',consolas:'Consolas, monospace','jetbrains mono':'"JetBrains Mono", Consolas, monospace','dot matrix':'Consolas, monospace'})[settings.font] || '"Segoe UI", Arial, sans-serif';
  } };
  window.uiReady = api.getUiSettings().then(settings => { window.Appearance.apply(settings); document.body.dataset.theme = window.Themes.normalizeId(settings.theme); return settings; }).catch(() => { window.Themes.apply(document, 'dark'); return {}; });
  document.addEventListener('click', event => { document.querySelectorAll('details.menu[open]').forEach(menu => { if (!menu.contains(event.target) || event.target.closest('button')) menu.open = false; }); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') document.querySelectorAll('details.menu[open]').forEach(menu => { menu.open = false; menu.querySelector('summary').focus(); }); });
  let previousFocus = new WeakMap();
  window.Dialogs = {
    show(element) { previousFocus.set(element, document.activeElement); element.setAttribute('role','dialog'); element.setAttribute('aria-modal','true'); const heading=element.querySelector('h2'); if(heading) { heading.id ||= element.id+'Title'; element.setAttribute('aria-labelledby',heading.id); } for(const sibling of element.parentElement.children) if(sibling!==element && sibling.tagName!=='SCRIPT') sibling.inert=true; element.classList.add('show'); element.querySelector('button,input,select')?.focus(); },
    hide(element) { element.classList.remove('show'); for(const sibling of element.parentElement.children) sibling.inert=false; previousFocus.get(element)?.focus(); }
  };
  document.addEventListener('keydown', event => {
    const modal = document.querySelector('.modal.show'); if (!modal) return;
    if (event.key === 'Escape') { event.preventDefault(); window.Dialogs.hide(modal); }
    if (event.key !== 'Tab') return;
    const items = [...modal.querySelectorAll('button:not(:disabled),input,select,[tabindex="0"]')].filter(el=>!el.hidden && el.style.display !== 'none');
    const first=items[0], last=items[items.length-1];
    if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
  });
})();

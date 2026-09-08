(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Themes = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const dark = { background:'#12151b', surface:'#1b2029', raised:'#242b36', text:'#eef1f6', muted:'#a6b0c0', border:'#384151', accent:'#9bb9ff', onAccent:'#142445', hover:'#303b4d', danger:'#ffb4ab', focus:'#c4d6ff', selection:'#354d77', overlayBackground:'#10141a', overlayText:'#ffffff' };
  const light = { background:'#f5f6f8', surface:'#ffffff', raised:'#edf0f5', text:'#192230', muted:'#536174', border:'#c7cfdb', accent:'#2859bd', onAccent:'#ffffff', hover:'#e2e8f2', danger:'#aa2525', focus:'#174fbb', selection:'#cfdefa', overlayBackground:'#10141a', overlayText:'#ffffff' };
  const registry = Object.freeze({ dark: Object.freeze({ id:'dark', name:'Dark', labelKey:'theme.dark', base:'dark', version:1, tokens:Object.freeze(dark) }), light: Object.freeze({ id:'light', name:'Light', labelKey:'theme.light', base:'light', version:1, tokens:Object.freeze(light) }) });
  function normalizeId(id) { return id === 'nothing' || id === 'nothing-os-light' ? 'light' : Object.hasOwn(registry, id) ? id : 'dark'; }
  function resolve(definition) {
    const base = registry[definition?.base === 'light' ? 'light' : 'dark'];
    const tokens = { ...base.tokens };
    for (const key of Object.keys(tokens)) if (/^#[0-9a-f]{6}$/i.test(definition?.tokens?.[key] || '')) tokens[key] = definition.tokens[key];
    return { ...base, id: typeof definition?.id === 'string' && /^[a-z][a-z0-9-]*$/.test(definition.id) ? definition.id : base.id, name: typeof definition?.name === 'string' ? definition.name : base.name, tokens };
  }
  function apply(document, id) {
    const theme = resolve(registry[normalizeId(id)]);
    document.documentElement.dataset.theme = theme.id;
    document.documentElement.style.colorScheme = theme.base;
    for (const [key,value] of Object.entries(theme.tokens)) document.documentElement.style.setProperty('--'+key.replace(/[A-Z]/g, c=>'-'+c.toLowerCase()), value);
    return theme.id;
  }
  return { registry, normalizeId, resolve, apply };
}));

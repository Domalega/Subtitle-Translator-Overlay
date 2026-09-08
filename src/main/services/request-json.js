'use strict';
async function requestJson(url, { fetch: fetchFn = fetch, timeoutMs = 8000 } = {}) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      (async () => { const response = await fetchFn(url, { signal: controller.signal }); return response.ok ? response.json() : null; })(),
      new Promise((_, reject) => { timer = setTimeout(() => { reject(new Error('Network request timed out')); controller.abort(); }, timeoutMs); })
    ]);
  } finally { clearTimeout(timer); }
}
module.exports = { requestJson };

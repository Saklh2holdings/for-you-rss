/**
 * Runs in the extension's ISOLATED world — has access to chrome.* APIs.
 * Receives TikTok items from the main-world script via a DOM event,
 * then POSTs them to the RSS server.
 */
(function () {
  console.log('[ForYou RSS] TikTok bridge ready');

  window.addEventListener('__foryourss_tiktok__', (event) => {
    let items;
    try { items = JSON.parse(event.detail); } catch { return; }
    if (!Array.isArray(items) || !items.length) return;

    console.log(`[ForYou RSS] Captured ${items.length} TikTok items → sending to extension background`);

    chrome.runtime.sendMessage({ type: 'TIKTOK_ITEMS', items }, (response) => {
      const runtimeErr = chrome.runtime.lastError;
      if (runtimeErr) {
        console.warn('[ForYou RSS] Background message failed:', runtimeErr.message);
        return;
      }
      if (response?.ok) {
        console.log('[ForYou RSS] Server ack:', response);
      } else {
        console.warn('[ForYou RSS] Background push failed:', response?.error ?? 'unknown error');
      }
    });
  });
})();

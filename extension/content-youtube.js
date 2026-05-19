/**
 * ISOLATED world — relay YouTube items to the background service worker.
 */
(function () {
  console.log('[ForYou RSS] YouTube bridge ready');

  window.addEventListener('__foryourss_youtube__', (event) => {
    let items;
    try { items = JSON.parse(event.detail); } catch { return; }
    if (!Array.isArray(items) || !items.length) return;

    console.log(`[ForYou RSS] Captured ${items.length} YouTube items → sending to background`);

    chrome.runtime.sendMessage({ type: 'YOUTUBE_ITEMS', items }, (response) => {
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

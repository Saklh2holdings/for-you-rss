/**
 * MAIN world — intercept YouTube Innertube browse/next responses from the home feed.
 */
(function () {
  const BROWSE_PATTERN = /\/youtubei\/v1\/(browse|next)/;
  const _fetch = window.fetch.bind(window);

  function textFromRuns(node) {
    if (!node) return '';
    if (typeof node === 'string') return node;
    if (node.simpleText) return node.simpleText;
    if (node.content) return textFromRuns(node.content);
    if (node.runs?.[0]?.text) return node.runs[0].text;
    return '';
  }

  function pushVideo(items, seen, videoId, title, author) {
    if (!videoId || seen.has(videoId)) return;
    seen.add(videoId);
    const t = title || '(YouTube video)';
    items.push({
      title: t,
      description: t,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      author: author || undefined,
      date: new Date().toISOString(),
      enclosureUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
      enclosureType: 'image/jpeg',
    });
  }

  function extractFromRenderer(node, items, seen) {
    if (!node || typeof node !== 'object') return;

    const vr = node.videoRenderer;
    if (vr?.videoId) {
      const title = textFromRuns(vr.title);
      const author = textFromRuns(vr.ownerText) || textFromRuns(vr.shortBylineText);
      pushVideo(items, seen, vr.videoId, title, author);
    }

    const gr = node.gridVideoRenderer;
    if (gr?.videoId) {
      const title = textFromRuns(gr.title);
      const author = textFromRuns(gr.shortBylineText);
      pushVideo(items, seen, gr.videoId, title, author);
    }

    const lockup = node.lockupViewModel;
    if (lockup?.contentId && (!lockup.contentType || lockup.contentType === 'VIDEO')) {
      const title = textFromRuns(lockup.metadata?.title) || textFromRuns(lockup.title);
      const rows = lockup.metadata?.metadata?.metadataRows ?? lockup.metadata?.metadata_rows ?? [];
      const author = textFromRuns(rows[0]?.metadataParts?.[0]?.text)
        || textFromRuns(rows[0]?.metadata_parts?.[0]?.text);
      pushVideo(items, seen, lockup.contentId, title, author);
    }
  }

  function walk(node, items, seen) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) walk(child, items, seen);
      return;
    }
    extractFromRenderer(node, items, seen);
    for (const value of Object.values(node)) walk(value, items, seen);
  }

  function extractItems(json) {
    const items = [];
    const seen = new Set();
    walk(json, items, seen);
    return items.slice(0, 60);
  }

  function maybeEmit(url, response) {
    if (!BROWSE_PATTERN.test(url)) return;
    response.clone().json().then((json) => {
      const items = extractItems(json);
      if (!items.length) return;
      window.dispatchEvent(new CustomEvent('__foryourss_youtube__', {
        detail: JSON.stringify(items),
      }));
    }).catch(() => {});
  }

  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input
      : input instanceof URL ? input.href
      : (input && input.url) ? input.url : '';

    const response = await _fetch(input, init);
    maybeEmit(url, response);
    return response;
  };

  const XHR = XMLHttpRequest.prototype;
  const _open = XHR.open;
  const _send = XHR.send;

  XHR.open = function (method, url, ...rest) {
    this.__foryourss_url = String(url ?? '');
    return _open.call(this, method, url, ...rest);
  };

  XHR.send = function (...args) {
    this.addEventListener('load', function () {
      try {
        const url = this.__foryourss_url ?? '';
        if (!BROWSE_PATTERN.test(url)) return;
        const json = JSON.parse(this.responseText);
        const items = extractItems(json);
        if (!items.length) return;
        window.dispatchEvent(new CustomEvent('__foryourss_youtube__', {
          detail: JSON.stringify(items),
        }));
      } catch {
        // ignore
      }
    });
    return _send.apply(this, args);
  };

  console.log('[ForYou RSS] YouTube capture ready');
})();

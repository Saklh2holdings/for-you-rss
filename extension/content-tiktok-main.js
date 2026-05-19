/**
 * Runs in the PAGE'S main world — can intercept TikTok's own fetch calls.
 * Communicates with the extension world via a custom DOM event.
 */
(function () {
  const FYP_PATTERN = /api\/recommend\/item_list/;
  const _fetch = window.fetch.bind(window);

  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input
      : input instanceof URL ? input.href
      : (input && input.url) ? input.url : '';

    const response = await _fetch(input, init);

    if (FYP_PATTERN.test(url)) {
      response.clone().json().then((json) => {
        const rawItems = json?.itemList ?? [];
        if (!rawItems.length) return;

        const items = rawItems.map((item) => {
          const authorId = item?.author?.uniqueId ?? 'unknown';
          const videoId  = item?.id ?? '';
          if (!videoId) return null;
          return {
            title:        item?.desc || '(TikTok video)',
            description:  item?.desc || '(TikTok video)',
            url:          `https://www.tiktok.com/@${authorId}/video/${videoId}`,
            author:       item?.author?.nickname ?? authorId,
            date:         item?.createTime
              ? new Date(item.createTime * 1000).toISOString()
              : new Date().toISOString(),
            enclosureUrl:  item?.video?.cover ?? null,
            enclosureType: 'image/jpeg',
          };
        }).filter(Boolean);

        if (!items.length) return;

        // Relay to the isolated-world content script via a DOM event
        window.dispatchEvent(new CustomEvent('__foryourss_tiktok__', {
          detail: JSON.stringify(items),
        }));
      }).catch(() => {});
    }

    return response;
  };
})();

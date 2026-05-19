const PLATFORM_LABELS = {
  twitter: 'Twitter / X',
  youtube: 'YouTube',
  reddit: 'Reddit',
  tiktok: 'TikTok',
  instagram: 'Instagram',
};

const YELLOW_HINTS = {
  twitter: 'Scroll your For You feed on X to capture the endpoint',
  tiktok: 'Scroll your For You feed on TikTok to capture the endpoint',
  instagram: 'Scroll your Home feed on Instagram to capture the endpoint',
};

const STATUS_LABELS = {
  green: 'Connected',
  yellow: 'Waiting for intercept',
  red: 'Not logged in',
};

function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function latestSyncTime(platformSync) {
  let latest = null;
  for (const p of Object.values(platformSync)) {
    if (p.ok && p.at && (!latest || p.at > latest)) latest = p.at;
  }
  return latest;
}

// ---- RSS strip ----

function makeRssStrip(rssUrl, itemCount) {
  const strip = document.createElement('div');
  strip.className = 'rss-strip';

  const urlSpan = document.createElement('span');
  urlSpan.className = 'rss-url';
  urlSpan.textContent = itemCount != null ? `${rssUrl}  (${itemCount} items)` : rssUrl;
  urlSpan.title = rssUrl;

  const copyBtn = document.createElement('button');
  copyBtn.className = 'rss-copy-btn';
  copyBtn.textContent = 'Copy';
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(rssUrl).then(() => {
      copyBtn.textContent = 'Copied!';
      copyBtn.classList.add('copied');
      setTimeout(() => { copyBtn.textContent = 'Copy'; copyBtn.classList.remove('copied'); }, 1800);
    });
  });

  const openLink = document.createElement('a');
  openLink.className = 'rss-open-link';
  openLink.textContent = 'Open';
  openLink.href = rssUrl;
  openLink.target = '_blank';
  openLink.rel = 'noopener';

  strip.appendChild(urlSpan);
  strip.appendChild(copyBtn);
  strip.appendChild(openLink);
  return strip;
}

// ---- Connected actions row ----

function makeActionsRow(platform, section, syncRecord) {
  const row = document.createElement('div');
  row.className = 'platform-actions';

  // Re-sync button
  const resyncBtn = document.createElement('button');
  resyncBtn.className = 'action-btn btn-resync';
  resyncBtn.textContent = 'Re-sync';
  resyncBtn.addEventListener('click', () => handleResync(platform, section, resyncBtn));

  // Disconnect button
  const disconnectBtn = document.createElement('button');
  disconnectBtn.className = 'action-btn btn-disconnect';
  disconnectBtn.textContent = 'Disconnect';
  disconnectBtn.addEventListener('click', () => handleDisconnect(platform, section, disconnectBtn, resyncBtn));

  row.appendChild(resyncBtn);
  row.appendChild(disconnectBtn);
  return row;
}

// ---- Build a platform section ----

function makePlatformSection(platform, info, syncRecord) {
  const section = document.createElement('div');
  section.className = 'platform-section';
  section.id = `section-${platform}`;

  const isConnected = syncRecord?.ok && syncRecord?.rssUrl;

  // Main row
  const main = document.createElement('div');
  main.className = 'platform-main';

  const dot = document.createElement('span');
  dot.className = `dot dot-${info.status}`;

  const name = document.createElement('span');
  name.className = 'platform-name';
  name.textContent = PLATFORM_LABELS[platform];

  const statusLabel = document.createElement('span');
  statusLabel.className = 'platform-status-label';
  statusLabel.textContent = STATUS_LABELS[info.status] ?? info.status;

  main.appendChild(dot);
  main.appendChild(name);
  main.appendChild(statusLabel);

  // If NOT connected: show the Sync button in the main row
  if (!isConnected) {
    const syncBtn = document.createElement('button');
    syncBtn.className = 'sync-btn';
    syncBtn.textContent = 'Sync';
    syncBtn.id = `sync-btn-${platform}`;

    if (info.status === 'red') {
      syncBtn.classList.add('hidden');
    } else if (info.status === 'yellow') {
      syncBtn.disabled = true;
      syncBtn.title = 'Scroll your For You feed first';
    }

    syncBtn.addEventListener('click', () => handleSync(platform, syncBtn, section));
    main.appendChild(syncBtn);
  }

  section.appendChild(main);

  // Yellow hint (disconnected only)
  if (!isConnected && info.status === 'yellow' && YELLOW_HINTS[platform]) {
    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = YELLOW_HINTS[platform];
    section.appendChild(hint);
  }

  // Error from last attempt
  if (syncRecord?.error && !syncRecord?.ok) {
    const errEl = document.createElement('div');
    errEl.className = 'platform-error';
    errEl.textContent = syncRecord.error;
    section.appendChild(errEl);
  }

  // Connected state: RSS strip + actions row
  if (isConnected) {
    section.appendChild(makeRssStrip(syncRecord.rssUrl, syncRecord.itemCount ?? null));
    section.appendChild(makeActionsRow(platform, section, syncRecord));

    // Non-fatal poll warning
    if (syncRecord?.pollError) {
      const warnEl = document.createElement('div');
      warnEl.className = 'platform-error';
      warnEl.textContent = `Feed will update at next poll. (${syncRecord.pollError})`;
      section.appendChild(warnEl);
    }
  }

  return section;
}

// ---- Action handlers ----

function handleSync(platform, syncBtn, section) {
  syncBtn.disabled = true;
  syncBtn.textContent = 'Syncing…';

  chrome.runtime.sendMessage({ type: 'SYNC_PLATFORM', platform }, (response) => {
    syncBtn.textContent = 'Sync';
    syncBtn.disabled = false;

    // Clear stale error
    section.querySelector('.platform-error')?.remove();

    if (response?.ok && response?.rssUrl) {
      // Rebuild section in connected state
      rebuildSection(platform);
      updateLastSyncLabel();
    } else {
      const errEl = document.createElement('div');
      errEl.className = 'platform-error';
      errEl.textContent = response?.error ?? 'Sync failed';
      section.appendChild(errEl);
    }
  });
}

function handleResync(platform, section, resyncBtn) {
  resyncBtn.disabled = true;
  resyncBtn.textContent = 'Syncing…';

  // Also disable disconnect during operation
  const disconnectBtn = section.querySelector('.btn-disconnect');
  if (disconnectBtn) disconnectBtn.disabled = true;

  chrome.runtime.sendMessage({ type: 'RESYNC_PLATFORM', platform }, (response) => {
    if (response?.ok && response?.rssUrl) {
      rebuildSection(platform);
      updateLastSyncLabel();
    } else {
      resyncBtn.disabled = false;
      resyncBtn.textContent = 'Re-sync';
      if (disconnectBtn) disconnectBtn.disabled = false;

      section.querySelector('.platform-error')?.remove();
      const errEl = document.createElement('div');
      errEl.className = 'platform-error';
      errEl.textContent = response?.error ?? 'Re-sync failed';
      section.appendChild(errEl);
    }
  });
}

function handleDisconnect(platform, section, disconnectBtn, resyncBtn) {
  disconnectBtn.disabled = true;
  disconnectBtn.textContent = 'Disconnecting…';
  if (resyncBtn) resyncBtn.disabled = true;

  chrome.runtime.sendMessage({ type: 'DISCONNECT_PLATFORM', platform }, (response) => {
    if (response?.ok) {
      rebuildSection(platform);
      updateLastSyncLabel();
    } else {
      disconnectBtn.disabled = false;
      disconnectBtn.textContent = 'Disconnect';
      if (resyncBtn) resyncBtn.disabled = false;

      section.querySelector('.platform-error')?.remove();
      const errEl = document.createElement('div');
      errEl.className = 'platform-error';
      errEl.textContent = response?.error ?? 'Disconnect failed';
      section.appendChild(errEl);
    }
  });
}

// Rebuild a single platform section in-place after a state change
function rebuildSection(platform) {
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
    if (!response) return;
    const info = response[platform] ?? { status: 'red' };
    const syncRecord = (response.platformSync ?? {})[platform] ?? null;
    const newSection = makePlatformSection(platform, info, syncRecord);
    const old = document.getElementById(`section-${platform}`);
    if (old) old.replaceWith(newSection);
  });
}

// ---- Render all platforms ----

function renderPlatforms(statusMap, platformSync) {
  const list = document.getElementById('platform-list');
  list.innerHTML = '';
  for (const platform of ['twitter', 'youtube', 'reddit', 'tiktok', 'instagram']) {
    const info = statusMap[platform] ?? { status: 'red' };
    const syncRecord = platformSync?.[platform] ?? null;
    list.appendChild(makePlatformSection(platform, info, syncRecord));
  }
}

// ---- Footer ----

function updateLastSyncLabel() {
  chrome.storage.local.get(['platformSync'], (result) => {
    const platformSync = result.platformSync ?? {};
    const latest = latestSyncTime(platformSync);
    const el = document.getElementById('last-sync-label');
    el.textContent = latest ? `Last sync ${formatTime(latest)}` : '';
  });
}

// ---- Initial load ----

function refresh() {
  chrome.storage.sync.get(['serverUrl'], (result) => {
    const serverUrl = result.serverUrl ?? 'http://localhost:3000';
    const el = document.getElementById('server-host');
    try { el.textContent = new URL(serverUrl).host; } catch { el.textContent = serverUrl; }
  });

  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
    if (!response) return;
    renderPlatforms(response, response.platformSync ?? {});
    updateLastSyncLabel();
  });
}

document.getElementById('options-link').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

refresh();

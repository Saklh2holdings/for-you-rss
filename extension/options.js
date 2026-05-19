const serverUrlInput = document.getElementById('server-url');
const adminKeyInput = document.getElementById('admin-key');
const saveBtn = document.getElementById('save-btn');
const saveStatus = document.getElementById('save-status');
const urlError = document.getElementById('url-error');

// Load saved values
chrome.storage.sync.get(['serverUrl', 'adminApiKey'], (result) => {
  serverUrlInput.value = result.serverUrl ?? 'http://localhost:3000';
  adminKeyInput.value = result.adminApiKey ?? '';
});

function validateUrl(raw) {
  const trimmed = raw.trim().replace(/\/$/, '');
  if (!trimmed) return { ok: false, msg: 'Server URL is required' };
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return { ok: false, msg: 'URL must start with http:// or https://' };
    }
    return { ok: true, value: trimmed };
  } catch {
    return { ok: false, msg: 'Invalid URL — example: http://localhost:3000' };
  }
}

saveBtn.addEventListener('click', () => {
  urlError.textContent = '';
  serverUrlInput.classList.remove('error');
  saveStatus.textContent = '';
  saveStatus.className = '';

  const validation = validateUrl(serverUrlInput.value);
  if (!validation.ok) {
    urlError.textContent = validation.msg;
    serverUrlInput.classList.add('error');
    return;
  }

  const adminApiKey = adminKeyInput.value.trim();

  chrome.storage.sync.set(
    { serverUrl: validation.value, adminApiKey },
    () => {
      saveStatus.textContent = 'Saved!';
      saveStatus.className = '';
      setTimeout(() => { saveStatus.textContent = ''; }, 2500);
    }
  );
});

// Save on Enter in either field
[serverUrlInput, adminKeyInput].forEach((input) => {
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveBtn.click();
  });
});

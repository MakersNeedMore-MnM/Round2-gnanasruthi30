document.addEventListener('DOMContentLoaded', async () => {
  const toggleEnabled = document.getElementById('toggle-enabled');
  const protectionLabel = document.getElementById('protection-status-label');
  const statusDot = document.getElementById('backend-status-dot');
  const statusText = document.getElementById('backend-status-text');

  // Load current toggle state
  const settings = await chrome.storage.local.get('enabled');
  const isEnabled = settings.enabled !== false;
  toggleEnabled.checked = isEnabled;
  updateProtectionLabel(isEnabled);

  // Toggle switch change handler
  toggleEnabled.addEventListener('change', async () => {
    const val = toggleEnabled.checked;
    await chrome.storage.local.set({ enabled: val });
    updateProtectionLabel(val);
  });

  function updateProtectionLabel(enabled) {
    if (enabled) {
      protectionLabel.textContent = 'Active & Guarding';
      protectionLabel.className = 'ct-sublabel';
    } else {
      protectionLabel.textContent = 'Paused (Clicks Direct)';
      protectionLabel.className = 'ct-sublabel disabled';
    }
  }

  // Check Backend status
  checkBackendHealth();

  function checkBackendHealth() {
    statusDot.className = 'ct-status-dot';
    statusText.textContent = 'Pinging backend...';

    chrome.runtime.sendMessage({ type: 'CHECK_HEALTH' }, (res) => {
      if (chrome.runtime.lastError || !res || !res.healthy) {
        statusDot.className = 'ct-status-dot offline';
        statusText.textContent = 'Offline — Start server at localhost:3001';
      } else {
        statusDot.className = 'ct-status-dot online';
        statusText.textContent = `Online (${res.data?.service || 'Ready'})`;
      }
    });
  }
});

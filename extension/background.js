/**
 * CyberTwin — Background Service Worker (Manifest V3)
 * Handles backend communication, bypassing webpage Content Security Policy (CSP).
 */

const DEFAULT_BACKEND_URL = 'https://cybertwin-backend.onrender.com';

// Initialize default storage settings on installation
chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(['enabled', 'backendUrl']);

  if (current.enabled === undefined) {
    await chrome.storage.local.set({ enabled: true });
  }

  // Use the live Render backend instead of the old localhost backend
  if (
    !current.backendUrl ||
    current.backendUrl === 'http://localhost:3001'
  ) {
    await chrome.storage.local.set({
      backendUrl: DEFAULT_BACKEND_URL
    });
  }

  console.log('[CyberTwin] Service Worker initialized with settings:', {
    enabled: current.enabled ?? true,
    backendUrl: current.backendUrl || DEFAULT_BACKEND_URL
  });
});

// Message listener for content scripts & popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'ANALYZE_URL') {
    handleAnalyzeUrl(request.url).then(sendResponse).catch(err => {
      sendResponse({
        success: false,
        error: err.message || 'Failed to reach CyberTwin backend'
      });
    });
    return true; // Keep message channel open for async response
  }

  if (request.type === 'CHECK_HEALTH') {
    handleCheckHealth().then(sendResponse).catch(err => {
      sendResponse({
        healthy: false,
        error: err.message || 'Backend unreachable'
      });
    });
    return true;
  }
});

async function getBackendUrl() {
  const stored = await chrome.storage.local.get('backendUrl');
  return stored.backendUrl || DEFAULT_BACKEND_URL;
}

async function handleAnalyzeUrl(url) {
  const baseUrl = await getBackendUrl();
  console.log(`[CyberTwin] Forwarding URL analysis to ${baseUrl}/analyze:`, url);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(`${baseUrl}/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ url }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      return {
        success: false,
        error: `Backend returned ${response.status}: ${errText}`
      };
    }

    const data = await response.json();
    return {
      success: true,
      data
    };
  } catch (error) {
    console.warn('[CyberTwin] Analyze request failed:', error);
    return {
      success: false,
      error: error.name === 'AbortError' ? 'Analysis timed out' : 'CyberTwin backend is not running at ' + baseUrl
    };
  }
}

async function handleCheckHealth() {
  const baseUrl = await getBackendUrl();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(`${baseUrl}/health`, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const json = await res.json();
      return { healthy: true, data: json };
    }
    return { healthy: false, status: res.status };
  } catch (err) {
    return { healthy: false, error: err.message };
  }
}

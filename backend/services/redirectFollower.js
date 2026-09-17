/**
 * CyberTwin — Redirect Follower & Raw HTML Fetcher
 * Follows HTTP redirects manually, tracks redirect chains and hops,
 * and fetches the final page HTML without executing JavaScript.
 */

async function fetchWithRedirectTracking(initialUrl, maxHops = 10, timeoutMs = 6000) {
  const chain = [];
  let currentUrl = initialUrl;
  let hops = 0;
  let finalHtml = '';
  let finalStatus = 200;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    while (hops < maxHops) {
      const response = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual', // Manual redirect control
        headers: {
          'User-Agent': 'CyberTwin-SecurityBot/1.0 (+https://github.com/cybertwin)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        signal: controller.signal
      });

      finalStatus = response.status;
      chain.push({ url: currentUrl, status: response.status });

      // Check for redirect status codes (301, 302, 303, 307, 308)
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) {
          break; // Redirect with no location header
        }

        // Resolve relative redirect locations
        currentUrl = new URL(location, currentUrl).toString();
        hops++;
      } else {
        // Final destination reached, extract HTML
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('text/html') || contentType.includes('application/xhtml') || contentType === '') {
          // Read up to 2MB of HTML text
          finalHtml = await response.text();
          if (finalHtml.length > 2 * 1024 * 1024) {
            finalHtml = finalHtml.slice(0, 2 * 1024 * 1024);
          }
        }
        break;
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      console.warn(`[RedirectFollower] Request timed out for: ${initialUrl}`);
    } else {
      console.warn(`[RedirectFollower] Fetch failed for: ${currentUrl}:`, err.message);
    }
  } finally {
    clearTimeout(timer);
  }

  // Cross-domain redirect detection
  let isCrossDomain = false;
  try {
    const initDomain = new URL(initialUrl).hostname;
    const finalDomain = new URL(currentUrl).hostname;
    isCrossDomain = initDomain !== finalDomain;
  } catch (e) {
    // Ignore parse error
  }

  return {
    initialUrl,
    finalUrl: currentUrl,
    hops,
    chain,
    isCrossDomain,
    status: finalStatus,
    html: finalHtml
  };
}

module.exports = { fetchWithRedirectTracking };

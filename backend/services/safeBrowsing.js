/**
 * CyberTwin — Google Safe Browsing API Service
 * Queries Google Safe Browsing Lookup API v4 when an API key is configured,
 * or falls back to standard threat test suites for demo resilience.
 */

async function checkSafeBrowsing(targetUrl) {
  const apiKey = process.env.SAFE_BROWSING_API_KEY;

  if (apiKey && apiKey.trim().length > 5) {
    try {
      const endpoint = `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(apiKey.trim())}`;
      const payload = {
        client: {
          clientId: 'cybertwin-prototype',
          clientVersion: '1.0.0'
        },
        threatInfo: {
          threatTypes: [
            'MALWARE',
            'SOCIAL_ENGINEERING',
            'UNWANTED_SOFTWARE',
            'POTENTIALLY_HARMFUL_APPLICATION'
          ],
          platformTypes: ['ANY_PLATFORM'],
          threatEntryTypes: ['URL'],
          threatEntries: [{ url: targetUrl }]
        }
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const data = await response.json();
        if (data.matches && data.matches.length > 0) {
          const match = data.matches[0];
          return {
            isClean: false,
            threatType: match.threatType || 'MALWARE',
            platformType: match.platformType,
            mode: 'live-google-api',
            details: `Identified by Google Safe Browsing as ${match.threatType}`
          };
        }
        return {
          isClean: true,
          mode: 'live-google-api',
          details: 'Clean on Google Safe Browsing Lookup'
        };
      } else {
        console.warn(`[SafeBrowsing API] Status ${response.status}. Falling back to test threat evaluator.`);
      }
    } catch (err) {
      console.warn('[SafeBrowsing API] Network query error, falling back:', err.message);
    }
  }

  // Fallback threat evaluator (ensures hackathon demo works without active Google Cloud billing)
  return evaluateSimulatedSafeBrowsing(targetUrl);
}

function evaluateSimulatedSafeBrowsing(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();
    const full = urlStr.toLowerCase();

    // Standard Google Safe Browsing Test URLs
    if (host.includes('testsafebrowsing.appspot.com')) {
      if (full.includes('phishing')) {
        return {
          isClean: false,
          threatType: 'SOCIAL_ENGINEERING',
          mode: 'test-dataset',
          details: 'Identified as Phishing / Social Engineering via test pattern'
        };
      }
      return {
        isClean: false,
        threatType: 'MALWARE',
        mode: 'test-dataset',
        details: 'Identified as Malware distribution via test pattern'
      };
    }

    // Heuristic test patterns for demo purposes
    if (
      full.includes('phish') ||
      full.includes('malware') ||
      full.includes('credential-harvest') ||
      host.includes('fake-bank-login')
    ) {
      return {
        isClean: false,
        threatType: 'SOCIAL_ENGINEERING',
        mode: 'test-dataset',
        details: 'Identified as Deceptive / Phishing pattern'
      };
    }

    return {
      isClean: true,
      mode: 'test-dataset',
      details: 'Clean on Safe Browsing test dataset'
    };
  } catch (e) {
    return {
      isClean: true,
      mode: 'fallback',
      details: 'Unable to parse URL'
    };
  }
}

module.exports = { checkSafeBrowsing };

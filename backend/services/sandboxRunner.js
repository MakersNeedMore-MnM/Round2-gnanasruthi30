/**
 * CyberTwin — Ephemeral Sandbox Digital Twin Runner
 * Spawns an isolated Playwright Chromium instance per request,
 * captures full rendered screenshots, network requests (POSTs/cross-domain),
 * traps automated downloads and dialogs, and immediately destroys the context.
 */

const { chromium } = require('playwright');

async function runSandboxTwin(targetUrl, options = {}) {
  const timeoutMs = options.timeoutMs || 10000;
  const startTime = Date.now();

  const networkRequests = [];
  const downloads = [];
  const dialogs = [];
  const consoleLogs = [];
  let screenshotBase64 = null;
  let pageTitle = '';
  let finalUrl = targetUrl;
  let navigationError = null;

  let browser = null;
  let context = null;

  try {
    // 1. Launch fresh headless browser instance (no shared state)
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-background-networking'
      ]
    });

    // 2. Create isolated ephemeral context (zero persistence)
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 CyberTwin/1.0',
      ignoreHTTPSErrors: true,
      acceptDownloads: true
    });

    const page = await context.newPage();

    // 3. Attach telemetry listeners
    page.on('request', (req) => {
      const reqUrl = req.url();
      let reqDomain = 'unknown';
      try {
        reqDomain = new URL(reqUrl).hostname;
      } catch (e) {}

      networkRequests.push({
        url: reqUrl,
        domain: reqDomain,
        method: req.method(),
        resourceType: req.resourceType(),
        postDataLength: req.postData() ? req.postData().length : 0
      });
    });

    page.on('download', (download) => {
      downloads.push({
        suggestedFilename: download.suggestedFilename(),
        url: download.url()
      });
      // Automatically cancel the download to prevent disk write
      download.cancel().catch(() => {});
    });

    page.on('dialog', (dialog) => {
      dialogs.push({
        type: dialog.type(),
        message: dialog.message()
      });
      dialog.dismiss().catch(() => {});
    });

    page.on('console', (msg) => {
      if (consoleLogs.length < 10) {
        consoleLogs.push(msg.text());
      }
    });

    // 4. Navigate headlessly to target URL
    try {
      await page.goto(targetUrl, {
        waitUntil: 'domcontentloaded',
        timeout: timeoutMs
      });
      // Give dynamic scripts 800ms to render and execute initial hooks
      await page.waitForTimeout(800);
    } catch (navErr) {
      console.warn(`[SandboxTwin] Navigation warning for ${targetUrl}:`, navErr.message);
      navigationError = navErr.message;
    }

    // 5. Extract rendered state & capture viewport screenshot
    try {
      pageTitle = await page.title();
      finalUrl = page.url();
      const screenshotBuffer = await page.screenshot({
        type: 'jpeg',
        quality: 65,
        fullPage: false
      });
      screenshotBase64 = `data:image/jpeg;base64,${screenshotBuffer.toString('base64')}`;
    } catch (shotErr) {
      console.warn('[SandboxTwin] Screenshot capture warning:', shotErr.message);
    }

  } catch (err) {
    console.error('[SandboxTwin] Sandbox execution error:', err);
    navigationError = err.message;
  } finally {
    // 6. TEARDOWN: Guarantee context and browser are completely destroyed
    if (context) {
      await context.close().catch(() => {});
    }
    if (browser) {
      await browser.close().catch(() => {});
    }
  }

  const executionTimeMs = Date.now() - startTime;
  console.log(`[SandboxTwin] Completed execution for ${targetUrl} in ${executionTimeMs}ms (${networkRequests.length} requests, ${downloads.length} downloads)`);

  // Analyze network telemetry
  const postRequests = networkRequests.filter(r => r.method === 'POST');
  let targetDomain = '';
  try {
    targetDomain = new URL(targetUrl).hostname;
  } catch (e) {}

  const crossDomainRequests = networkRequests.filter(r => r.domain !== targetDomain && r.domain !== 'unknown');

  const telemetry = {
    executionTimeMs,
    executionTimeSeconds: (executionTimeMs / 1000).toFixed(2),
    pageTitle,
    finalUrl,
    screenshotBase64,
    navigationError,
    networkSummary: {
      totalRequests: networkRequests.length,
      postRequestsCount: postRequests.length,
      crossDomainCount: crossDomainRequests.length,
      postRequests: postRequests.slice(0, 5),
      requestsSample: networkRequests.slice(0, 10)
    },
    downloads: {
      attempted: downloads.length > 0,
      count: downloads.length,
      items: downloads
    },
    dialogs: {
      attempted: dialogs.length > 0,
      count: dialogs.length,
      items: dialogs
    },
    consoleLogs: consoleLogs.slice(0, 5)
  };

  return telemetry;
}

module.exports = { runSandboxTwin };

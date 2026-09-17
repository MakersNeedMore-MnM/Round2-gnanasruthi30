require('dotenv').config();
const { runSandboxTwin } = require('./services/sandboxRunner');
const express = require('express');
const cors = require('cors');
const path = require('path');
const { checkSafeBrowsing } = require('./services/safeBrowsing');
const { checkDomainAge } = require('./services/whoisService');
const { fetchWithRedirectTracking } = require('./services/redirectFollower');
const { analyzeHtml } = require('./services/staticAnalyzer');

const app = express();
const PORT = process.env.PORT || 3001;

// Enable CORS for Chrome Extension requests and local demo origins
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Serve static demo test bench & test fixtures
const demoDir = path.join(__dirname, '..', 'demo');
const fixturesDir = path.join(__dirname, 'fixtures');
app.use('/demo', express.static(demoDir));
app.use('/fixtures', express.static(fixturesDir));

// Multi-hop redirect test endpoint
app.get('/fixtures/redirect-hop', (req, res) => {
  const step = parseInt(req.query.step || '1', 10);
  if (step === 1) {
    return res.redirect(302, `/fixtures/redirect-hop?step=2`);
  } else if (step === 2) {
    return res.redirect(302, `/fixtures/redirect-hop?step=3`);
  } else {
    return res.redirect(302, `/fixtures/clean-page.html`);
  }
});

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.originalUrl}`);
  next();
});

// Root route: CyberTwin Status & Navigation Hub
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CyberTwin Backend Hub</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: #090e17; color: #f1f5f9; padding: 40px 20px; line-height: 1.6; }
    .container { max-width: 760px; margin: 0 auto; }
    .header { border-bottom: 1px solid #1e293b; padding-bottom: 24px; margin-bottom: 28px; }
    .badge { display: inline-block; background: rgba(34, 197, 94, 0.15); color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.35); padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 700; margin-bottom: 12px; }
    h1 { font-size: 28px; color: #ffffff; margin-bottom: 6px; display: flex; align-items: center; gap: 10px; }
    p.lead { color: #94a3b8; font-size: 15px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; margin-bottom: 28px; }
    .card { background: #0f172a; border: 1px solid #1e293b; border-radius: 12px; padding: 20px; }
    .card h2 { font-size: 16px; margin-bottom: 8px; color: #38bdf8; display: flex; align-items: center; gap: 8px; }
    .card p { font-size: 13px; color: #94a3b8; margin-bottom: 16px; }
    .btn { display: inline-block; background: #0284c7; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 8px; font-weight: 600; font-size: 13px; transition: background 0.15s; }
    .btn:hover { background: #0369a1; }
    .btn-secondary { background: #1e293b; border: 1px solid #334155; color: #cbd5e1; }
    .btn-secondary:hover { background: #273549; color: #ffffff; }
    .guide-box { background: #0f172a; border: 1px solid #1e293b; border-radius: 12px; padding: 22px; }
    .guide-box h3 { font-size: 15px; color: #f8fafc; margin-bottom: 12px; }
    .guide-box ol { padding-left: 20px; font-size: 13px; color: #cbd5e1; }
    .guide-box li { margin-bottom: 8px; }
    code { background: #1e293b; color: #38bdf8; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
  </style>
</head>
<body>
  <div class="container">
    <header class="header">
      <div class="badge">🟢 Backend Online — Stage 2 Active</div>
      <h1>🛡️ CyberTwin Backend Server</h1>
      <p class="lead">Static HTML Analysis: Password Forms, Brand Mismatch, Obfuscated Scripts & Redirect Chains.</p>
    </header>

    <div class="grid">
      <div class="card">
        <h2>🚀 Test Playground</h2>
        <p>Interactive test bench with Fast Pass, Brand Mismatch Phish, Obfuscated Scripts, and Redirect Hops.</p>
        <a href="/demo/test-page.html" class="btn">Open Demo Bench &rarr;</a>
      </div>
      <div class="card">
        <h2>🩺 Health & Status</h2>
        <p>Inspect raw JSON status, active pipeline stage, and backend service verification.</p>
        <a href="/health" class="btn btn-secondary">View /health JSON &rarr;</a>
      </div>
    </div>

    <div class="guide-box">
      <h3>Chrome Extension Setup Guide:</h3>
      <ol>
        <li>Open Chrome and navigate to <code>chrome://extensions</code></li>
        <li>Toggle on <strong>Developer mode</strong> in the top right.</li>
        <li>Click <strong>Load unpacked</strong> and select folder: <code>D:\\cybertwin\\extension</code></li>
        <li>Open the <a href="/demo/test-page.html" style="color: #38bdf8;">Demo Bench</a> to test live static analysis!</li>
      </ol>
    </div>
  </div>
</body>
</html>
  `);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'cybertwin-backend',
    stage: 2,
    pipeline: 'Safe Browsing + WHOIS + Static HTML Heuristics (Cheerio)',
    timestamp: new Date().toISOString()
  });
});

// Analysis endpoint: Stage 1 Fast Reputation + Stage 2 Static Analysis
app.post('/analyze', async (req, res) => {
  const { url } = req.body || {};

  if (!url) {
    return res.status(400).json({
      error: 'Missing "url" field in request body'
    });
  }

  console.log(`[CyberTwin] Analyzing URL: ${url}`);

  try {
    // -------------------------------------------------------------
    // STAGE 1: Fast Reputation Check (Safe Browsing + WHOIS)
    // -------------------------------------------------------------
    const [sbResult, whoisResult] = await Promise.all([
      checkSafeBrowsing(url),
      checkDomainAge(url)
    ]);

    // Case 1A: Safe Browsing Flagged (Instant Dangerous)
    if (!sbResult.isClean) {
      return res.json({
        url,
        riskScore: 92,
        verdict: 'dangerous',
        tier: 'reputation-flagged',
        reason: `Flagged by Google Safe Browsing: ${sbResult.threatType || 'Malicious'}`,
        plainEnglish: `Google's threat intelligence database has flagged this URL as active ${formatThreatName(sbResult.threatType)}. It is unsafe to proceed.`,
        metadata: {
          domain: whoisResult.domain,
          domainAgeMonths: whoisResult.ageMonths,
          creationDate: whoisResult.creationDate,
          safeBrowsing: sbResult
        },
        timestamp: Date.now()
      });
    }

    // Case 1B: Fast Reputation Pass (Clean Safe Browsing AND domain age >= 6 months)
    // If domain is established and not a fixture test page, return fast pass immediately!
    const isLocalFixture = url.includes('/fixtures/');
    if (whoisResult.isEstablished && !isLocalFixture) {
      const ageDisplay = whoisResult.ageMonths >= 12
        ? `${Math.floor(whoisResult.ageMonths / 12)}+ years`
        : `${whoisResult.ageMonths} months`;

      return res.json({
        url,
        riskScore: 8,
        verdict: 'safe',
        tier: 'fast',
        reason: 'Trusted domain',
        plainEnglish: `Fast reputation pass: Domain is well-established (${ageDisplay} old, registered ${whoisResult.creationDate || 'verified'}) and clean on Google Safe Browsing.`,
        metadata: {
          domain: whoisResult.domain,
          domainAgeMonths: whoisResult.ageMonths,
          creationDate: whoisResult.creationDate,
          safeBrowsing: 'clean'
        },
        timestamp: Date.now()
      });
    }

    // -------------------------------------------------------------
    // STAGE 2: Static Analysis (Fall-through from young/unverified domain or deep test)
    // -------------------------------------------------------------
    console.log(`[CyberTwin Stage 2] Executing static HTML analysis on: ${url}`);

    // Step 2A: Follow redirects manually and fetch raw HTML (no JS)
    const redirectResult = await fetchWithRedirectTracking(url);

    // Step 2B: Run Cheerio heuristics
    const staticResult = analyzeHtml(
      redirectResult.html,
      redirectResult.finalUrl,
      redirectResult,
      whoisResult
    );

        console.log(`[CyberTwin Stage 2] Heuristic score: ${staticResult.score}, Verdict: ${staticResult.verdict}, Flags: ${staticResult.flags.length}`);

    // -------------------------------------------------------------
    // STAGE 3: Sandbox Execution (only when Stage 2 flags escalation)
    // -------------------------------------------------------------
    let sandboxTelemetry = null;
    let finalScore = staticResult.score;
    let finalVerdict = staticResult.verdict;
    let finalTier = staticResult.tier;
    let finalReason = staticResult.flags.length > 0 ? staticResult.flags[0] : 'Static analysis clean';
    let finalPlainEnglish = staticResult.plainEnglish;

    if (staticResult.tier === 'stage2-escalated') {
      console.log(`[CyberTwin Stage 3] Escalating to sandbox execution: ${redirectResult.finalUrl}`);
      sandboxTelemetry = await runSandboxTwin(redirectResult.finalUrl);

      const downloadAttempted = sandboxTelemetry.downloads.attempted;
      const crossDomainCount = sandboxTelemetry.networkSummary.crossDomainCount;

      if (downloadAttempted) {
        finalScore = Math.max(finalScore, 85);
        finalVerdict = 'dangerous';
        finalReason = `Sandbox detected an automatic file download attempt (${sandboxTelemetry.downloads.items[0]?.suggestedFilename || 'unknown file'})`;
        finalPlainEnglish = `When opened in an isolated environment, this page tried to automatically download a file to your computer without asking — a common malware delivery tactic. ${finalPlainEnglish}`;
      } else if (crossDomainCount > 2) {
        finalScore = Math.max(finalScore, 60);
        finalVerdict = finalVerdict === 'safe' ? 'suspicious' : finalVerdict;
        finalReason = `Sandbox observed contact with ${crossDomainCount} external domains`;
        finalPlainEnglish = `In our isolated test, this page silently contacted ${crossDomainCount} other websites in the background — more than expected for a normal page. ${finalPlainEnglish}`;
      } else {
        finalReason = 'Sandbox execution found no dangerous behavior';
        finalPlainEnglish = `We safely opened this page in an isolated environment and it behaved normally — no hidden downloads or suspicious background activity. ${finalPlainEnglish}`;
      }

      finalTier = 'sandbox-executed';
    }

    // Return final outcome (Stage 2, or Stage 3 if escalated)
        return res.json({
      url,
      riskScore: finalScore,
      verdict: finalVerdict,
      tier: finalTier,
      reason: finalReason,
      plainEnglish: finalPlainEnglish,
      metadata: {
        domain: whoisResult.domain,
        domainAgeMonths: whoisResult.ageMonths,
        creationDate: whoisResult.creationDate,
        safeBrowsing: 'clean',
        staticAnalysis: {
          flags: staticResult.flags,
          details: staticResult.details,
          redirectHops: redirectResult.hops,
          finalUrl: redirectResult.finalUrl
        },
        sandbox: sandboxTelemetry ? {
          screenshotBase64: sandboxTelemetry.screenshotBase64,
          executionTimeSeconds: sandboxTelemetry.executionTimeSeconds,
          downloadAttempted: sandboxTelemetry.downloads.attempted,
          crossDomainCount: sandboxTelemetry.networkSummary.crossDomainCount,
          totalRequests: sandboxTelemetry.networkSummary.totalRequests
        } : null
      },
      timestamp: Date.now()
    });

  } catch (err) {
    console.error('[CyberTwin Analysis Error]', err);
    return res.status(500).json({
      error: 'Analysis failed',
      details: err.message
    });
  }
});

function formatThreatName(threatType) {
  if (!threatType) return 'threat';
  if (threatType === 'SOCIAL_ENGINEERING') return 'phishing / deceptive content';
  if (threatType === 'MALWARE') return 'malware distribution';
  if (threatType === 'UNWANTED_SOFTWARE') return 'unwanted software';
  return threatType.toLowerCase().replace(/_/g, ' ');
}

// Global error handler
app.use((err, req, res, next) => {
  console.error('[CyberTwin Backend Error]', err);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`  CyberTwin Backend Server (Stage 2)`);
  console.log(`  Listening on: http://localhost:${PORT}`);
  console.log(`  Dashboard:    http://localhost:${PORT}/`);
  console.log(`  Demo Bench:   http://localhost:${PORT}/demo/test-page.html`);
  console.log(`  Health Check: http://localhost:${PORT}/health`);
  console.log(`  Analyze API:  http://localhost:${PORT}/analyze`);
  console.log(`=========================================`);
});

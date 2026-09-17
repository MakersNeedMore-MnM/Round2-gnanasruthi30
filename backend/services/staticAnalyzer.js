/**
 * CyberTwin — Static HTML Heuristic Analyzer
 * Parses raw HTML without executing JavaScript.
 * Inspects: password fields, brand mismatches, obfuscated scripts, and redirect hops.
 */

const cheerio = require('cheerio');

const KNOWN_BRANDS = [
  {
    name: 'Microsoft',
    pattern: /\b(microsoft|office\s*365|onedrive|outlook|azure)\b/i,
    validDomains: ['microsoft.com', 'live.com', 'office.com', 'outlook.com', 'azure.com', 'windows.com']
  },
  {
    name: 'Google',
    pattern: /\b(google|gmail|google\s*drive|google\s*workspace)\b/i,
    validDomains: ['google.com', 'gmail.com', 'youtube.com']
  },
  {
    name: 'Apple',
    pattern: /\b(apple|icloud|apple\s*id|itunes)\b/i,
    validDomains: ['apple.com', 'icloud.com']
  },
  {
    name: 'PayPal',
    pattern: /\b(paypal)\b/i,
    validDomains: ['paypal.com', 'paypal.me']
  },
  {
    name: 'Amazon',
    pattern: /\b(amazon|prime\s*video|aws)\b/i,
    validDomains: ['amazon.com', 'aws.amazon.com']
  },
  {
    name: 'Netflix',
    pattern: /\b(netflix)\b/i,
    validDomains: ['netflix.com']
  },
  {
    name: 'Meta / Facebook',
    pattern: /\b(facebook|instagram|whatsapp)\b/i,
    validDomains: ['facebook.com', 'instagram.com', 'whatsapp.com', 'meta.com']
  },
  {
    name: 'Bank of America',
    pattern: /\b(bank\s*of\s*america|bofa)\b/i,
    validDomains: ['bankofamerica.com']
  },
  {
    name: 'Chase',
    pattern: /\b(chase\s*bank|jpmorgan)\b/i,
    validDomains: ['chase.com', 'jpmorgan.com']
  }
];

function analyzeHtml(html, finalUrl, redirectMeta = {}, domainAgeMeta = {}) {
  const flags = [];
  const details = {};
  let heuristicScore = 5;

  if (!html || typeof html !== 'string') {
    return {
      score: 25,
      verdict: 'suspicious',
      tier: 'stage2-escalated',
      flags: ['No HTML content or empty response'],
      details: { emptyContent: true },
      plainEnglish: 'The server returned an empty or unreadable response, which prevented static analysis.'
    };
  }

  const $ = cheerio.load(html);

  // Extract hostname
  let hostname = '';
  try {
    hostname = new URL(finalUrl).hostname.toLowerCase();
  } catch (e) {
    hostname = 'unknown';
  }

  // 1. Check for Brand Mismatch
  const pageTitle = $('title').text().trim();
  const headings = $('h1, h2, h3').map((_, el) => $(el).text().trim()).get().join(' ');
  const metaDesc = $('meta[name="description"]').attr('content') || '';
  const pageTextSample = (pageTitle + ' ' + headings + ' ' + metaDesc).slice(0, 1500);

  let detectedBrandMismatch = null;

  for (const brand of KNOWN_BRANDS) {
    if (brand.pattern.test(pageTextSample)) {
      // Check if actual domain is in brand's authorized list
      const isAuthorized = brand.validDomains.some(validDomain =>
        hostname === validDomain || hostname.endsWith('.' + validDomain)
      );

      if (!isAuthorized) {
        detectedBrandMismatch = {
          brand: brand.name,
          actualDomain: hostname,
          authorizedDomains: brand.validDomains
        };
        break;
      }
    }
  }

  details.brandMismatch = {
    detected: Boolean(detectedBrandMismatch),
    info: detectedBrandMismatch
  };

  if (detectedBrandMismatch) {
    flags.push(`Brand mismatch: Displays "${detectedBrandMismatch.brand}" branding on unrelated domain (${hostname})`);
    heuristicScore += 40;
  }

  // 2. Check for Password Input Fields
  const passwordInputs = $('input[type="password"]');
  const credentialForms = $('form').filter((_, el) => {
    const action = $(el).attr('action') || '';
    const formHtml = $(el).html() || '';
    return /login|signin|auth|account|verify/i.test(action) || /password|passwd|pwd/i.test(formHtml);
  });

  const hasPasswordInput = passwordInputs.length > 0 || credentialForms.length > 0;
  details.passwordField = {
    detected: hasPasswordInput,
    passwordInputsCount: passwordInputs.length,
    credentialFormsCount: credentialForms.length
  };

  if (hasPasswordInput) {
    flags.push('Password credential field detected');
    if (detectedBrandMismatch) {
      heuristicScore += 35; // Brand mismatch + password is fatal phishing combo
    } else if (!domainAgeMeta.isEstablished) {
      heuristicScore += 30;
    } else {
      heuristicScore += 15;
    }
  }

  // 3. Check for Obfuscated Inline Scripts
  const inlineScripts = $('script:not([src])');
  const obfuscationReasons = [];

  inlineScripts.each((_, el) => {
    const code = $(el).html() || '';
    if (code.length < 15) return;

    if (/eval\s*\(/i.test(code)) {
      obfuscationReasons.push('Dynamic code evaluation via eval()');
    }
    if (/unescape\s*\(|String\.fromCharCode\s*\(/i.test(code)) {
      obfuscationReasons.push('Character unescaping / fromCharCode obfuscation');
    }
    if (/(\\x[0-9a-fA-F]{2}){4,}/.test(code)) {
      obfuscationReasons.push('Hex-encoded string patterns');
    }
    if (/_0x[a-f0-9]{4,}|eval\(function\(p,a,c,k,e,r/i.test(code)) {
      obfuscationReasons.push('Packed JavaScript / polymorphic variable names');
    }
  });

  const hasObfuscatedScripts = obfuscationReasons.length > 0;
  details.obfuscatedScripts = {
    detected: hasObfuscatedScripts,
    count: obfuscationReasons.length,
    reasons: [...new Set(obfuscationReasons)]
  };

  if (hasObfuscatedScripts) {
    flags.push(`Obfuscated JavaScript detected (${details.obfuscatedScripts.reasons.join(', ')})`);
    heuristicScore += 40;
  }

  // 4. Check for Redirect Hops & Cross-Domain Hops
  const hops = redirectMeta.hops || 0;
  const isCrossDomain = redirectMeta.isCrossDomain || false;

  details.redirects = {
    hops,
    isCrossDomain,
    chain: redirectMeta.chain || []
  };

  if (hops >= 3) {
    flags.push(`Excessive redirect chain (${hops} hops)`);
    heuristicScore += 35;
  } else if (hops > 0 && isCrossDomain) {
    flags.push(`Cross-domain redirect detected (redirected across different domains)`);
    heuristicScore += 20;
  }

  // Incorporate baseline domain age from Stage 1 if domain was young
  if (domainAgeMeta.isEstablished === false) {
    heuristicScore += 15;
    flags.push('Domain registration is young (< 6 months old)');
  }

  // Final score clamping
  const finalScore = Math.min(95, Math.max(8, heuristicScore));

  // Determine verdict and tier
  const isSuspicious = finalScore >= 40 || (hasPasswordInput && detectedBrandMismatch) || hasObfuscatedScripts || hops >= 3;
  const verdict = finalScore >= 70 ? 'dangerous' : isSuspicious ? 'suspicious' : 'safe';
  const tier = isSuspicious ? 'stage2-escalated' : 'static-pass';

  // Compose plain English explanation
  const plainEnglish = buildPlainEnglishExplanation(flags, finalScore, detectedBrandMismatch, hasPasswordInput, hasObfuscatedScripts, hops);

  return {
    score: finalScore,
    verdict,
    tier,
    flags,
    details,
    plainEnglish
  };
}

function buildPlainEnglishExplanation(flags, score, brandMismatch, hasPassword, hasObfuscated, hops) {
  if (flags.length === 0 || score < 40) {
    return 'Static HTML analysis found no credential harvesting forms, no brand impersonation, and clean code structure. The page appears normal.';
  }

  const parts = [];

  if (brandMismatch) {
    parts.push(`This webpage displays ${brandMismatch.brand} branding, but the actual domain (${brandMismatch.actualDomain}) does not belong to ${brandMismatch.brand}. This is a primary sign of phishing.`);
  }

  if (hasPassword) {
    if (brandMismatch) {
      parts.push('It contains a password input form attempting to collect user credentials under a deceptive brand.');
    } else {
      parts.push('The page asks for a password on an unverified website.');
    }
  }

  if (hasObfuscated) {
    parts.push('It contains hidden or obfuscated JavaScript structured to conceal its execution from security scanners.');
  }

  if (hops >= 3) {
    parts.push(`It bounced through ${hops} separate redirects before loading, a common evasive tactic used by malicious links.`);
  }

  return parts.join(' ');
}

module.exports = { analyzeHtml };

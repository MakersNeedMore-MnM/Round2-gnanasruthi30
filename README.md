# CyberTwin — "Preview Before You Proceed"

> **Browser-based security pre-flight that intercepts link clicks, executes and inspects them in an isolated disposable sandbox, and shows users a plain-English risk report before they proceed.**

---

## 🧭 Architecture Roadmap

| Stage | Name | Status | Description |
| :--- | :--- | :---: | :--- |
| **Stage 0** | **Skeleton & Intercept Loop** | ✅ **COMPLETE** | In-page DOM click interceptor, Shadow DOM pre-flight UI, `/analyze` backend loop, Proceed/Cancel actions. |
| **Stage 1** | **Fast Reputation Check** | ✅ **COMPLETE** | Google Safe Browsing API + WHOIS domain age fast-path (`riskScore < 15` for trusted domains, fall-through for young domains, threat flagging). |
| **Stage 2** | **Static Analysis** | ✅ **COMPLETE** | Raw HTML fetch (no JS execution), password field detection, brand mismatch heuristics, obfuscated inline script scan, manual redirect hop tracking. |
| **Stage 3** | **Sandbox Execution ("Twin")**| ⏳ *Planned* | Ephemeral Playwright browser context / container per request, full-page screenshot, network request log, download prompts. |
| **Stage 4** | **AI Risk Analysis** | ⏳ *Planned* | Claude API (`claude-sonnet-4-6`) structured JSON evaluation converting telemetry into plain-English explanations without jargon. |
| **Stage 5** | **Decision UI Polish** | ⏳ *Planned* | Color-coded risk gauge, sandbox screenshot preview, plain-English summary, Proceed/Cancel. |

---

## 🔍 Judge Note: Real vs. Simulated in Stage 2

### What is REAL in Stage 2:
- **Real Raw HTML Fetching**: Uses manual HTTP GET with headers to download raw page markup without executing client-side scripts.
- **Real Manual Redirect Chain Following**: Manually follows HTTP `301`, `302`, `303`, `307`, `308` redirect headers, records the exact hop history, counts hops, and detects cross-domain redirection jumps.
- **Real DOM Parsing via Cheerio**: Fast, non-executing DOM inspection:
  - **Password Form Trap**: Detects `<input type="password">` and authentication forms.
  - **Brand Mismatch Heuristic**: Scans `<title>`, `<h1>`, `<h2>`, and metadata for high-value targets (Microsoft, Google, Apple, PayPal, Amazon, Netflix, Chase, Bank of America) and verifies whether the apex domain is legitimately authorized.
  - **Obfuscation Detection**: Detects dynamic `eval()`, `unescape()`, `String.fromCharCode()`, hex-encoded patterns (`\xNN`), and polymorphic script packers (`_0x`, `p,a,c,k,e,r`).
- **Real Weighted Heuristics Scorer**: Automatically scores risks, calculates verdicts (`safe`, `suspicious`, `dangerous`), generates plain-English explanations, and flags suspicious pages for Stage 3 escalation.

---

## 🚀 Quickstart & Demo Guide

### Step 1: Start the Backend Server

```powershell
cd d:\cybertwin\backend
npm start
```

Server endpoints:
- Dashboard: `http://localhost:3001/`
- Interactive Demo Bench: `http://localhost:3001/demo/test-page.html`
- Health Check: `http://localhost:3001/health`
- Analyze API: `http://localhost:3001/analyze`

---

### Step 2: Reload the Extension in Chrome

1. Open `chrome://extensions` in Chrome.
2. Click the **Refresh (↻)** button on the CyberTwin extension card.

---

### Step 3: Run the Live Stage 2 Demo

Open the demo playground at: **[http://localhost:3001/demo/test-page.html](http://localhost:3001/demo/test-page.html)**

1. **Case 1: Brand Mismatch + Password Form (Phishing)**:
   - Click `Brand Mismatch Phishing Test`.
   - **Result**: `80 / 100` (Red / DANGEROUS).
   - Badges: `⚠️ STAGE 2 ESCALATED`, `🏷️ Brand Mismatch: Microsoft`, `🔑 Password Field`.
   - Explanation: Identifies that Microsoft branding is used on an unauthorized domain alongside a credential password form.
2. **Case 2: Obfuscated Inline JavaScript**:
   - Click `Obfuscated Script Test`.
   - **Result**: `45 / 100` (Yellow / SUSPICIOUS).
   - Badges: `⚠️ STAGE 2 ESCALATED`, `📜 Obfuscated JS (3)`.
   - Explanation: Explains that hidden/obfuscated JavaScript code was detected trying to conceal execution.
3. **Case 3: Excessive Redirect Chain (3 Hops)**:
   - Click `3-Hop Redirect Chain Test`.
   - **Result**: `40 / 100` (Yellow / SUSPICIOUS).
   - Badges: `⚠️ STAGE 2 ESCALATED`, `🔀 3 Redirect Hops`.
4. **Case 4: Clean Static HTML Pass**:
   - Click `Clean Static Page`.
   - **Result**: `8 / 100` (Green / SAFE).
   - Badges: `🛡️ STATIC PASS`.
   - Explanation: Confirms zero credential traps, zero brand mismatches, and normal HTML.

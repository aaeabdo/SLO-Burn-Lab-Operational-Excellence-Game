# SLO Burn Lab — Operational Excellence Game

A single‑file, gamified **React + Vite** app to learn and demo core Operational Excellence concepts:

* **Select a service tier** and see minimum SLOs & on‑call expectations.
* **Define SLO / SLI** and compute error budgets.
* **Push logs** that follow a standardized **business\_process\_logger** schema (extended to carry SLO compliance).
* **Visualize logs & signals** (throughput, errors, latency p95, saturation).
* **Experience alerting** with **Google’s Multi‑Window Multi‑Burn‑Rate (MWMB)** rules and compare to classic threshold alerts.

> Built for the “Operational Excellence Handbook: Mastering the Pulse of Our Digital World.” No data leaves your browser.

---

## ✨ Why this exists

SLOs, SLIs, error budgets, and burn‑rate alerts can feel abstract. This project turns them into a sandbox you can run anywhere, so teams can **see** how choices affect reliability signals and when paging should occur.

---

## 🚀 Demo

You can host it as a static site (GitHub Pages, Netlify, Vercel, Cloudflare Pages). See **Deploy** below.

---

## 🧰 Tech stack

* **React + Vite**
* **Tailwind CSS** (v3 recommended)
* **Recharts** (charts) & **lucide‑react** (icons)

---

## 🕹️ Features

* **Tiers:** Tier‑0 → Tier‑3 with min SLOs, downtime budgets, and MTTA/MTTR guardrails.
* **SLIs & SLOs:** Availability (%) and latency p95 (ms). Error budget computed from SLO.
* **SLI‑baked error policy:** When enabled (recommended), an event is “good” only if it is **successful and meets latency**. Slow‑but‑successful counts as an error for burn‑rate math.
* **Google MWMB Alerts:** Short/long windows with 1/12 ratio, thresholds at **14.4×, 6×, 3×, 1×** for page/ticket severities — **alerts fire only while you are actively burning budget**.
* **Comparative alerts:** Classic SLO breach, latency p95 threshold, CPU saturation, and a business metric rule (promo abuse) so you can **compare** against burn‑rate paging.
* **Scenarios:** Calm, K8s Network Meltdown, Viral Discount Code.
* **Export:** Download simulated logs as JSON.
* **Built‑in self‑tests:** Validates burn‑rate math and window ratios.

---

## 🏗️ Quick start (local)

**Requirements:** Node 18+ (Node 20 LTS recommended), npm

```bash
# 1) Create a Vite app
npm create vite@latest slo-burn-lab -- --template react
cd slo-burn-lab

# 2) Install deps
npm i
npm i recharts lucide-react

# 3) Tailwind (v3 recommended)
npm i -D tailwindcss@3 postcss autoprefixer
npx tailwindcss init -p
```

**tailwind.config.js**

```js
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
}
```

**src/index.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

**Add the app code**

* Replace `src/App.jsx` with the component in `src/OperationalExcellenceGame.jsx` (or keep as `App.jsx`).
* Ensure the file **exports a default React component**.

Run it:

```bash
npm run dev
```

Build it:

```bash
npm run build
```

> **Tailwind v4 users:** The classic `init -p` flow has changed. If you hit `could not determine executable to run`, pin `tailwindcss@3` (above) or use the CDN in `index.html`.

---

## ☁️ Deploy

### GitHub Pages (project site)

1. Set Vite base path to your repo name (e.g., `slo-burn-lab`):

**vite.config.js**

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/slo-burn-lab/', // ← replace with your repo name
})
```

2. Add GitHub Actions workflow:

**.github/workflows/deploy.yml**

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [ main ]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

3. Push to `main` and enable **Settings → Pages → Source: GitHub Actions**.

> Alternatives: Netlify, Vercel, Cloudflare Pages (build: `npm run build`, output: `dist/`).

---

## 🔧 Configuration knobs

* **`DEMO_HOUR_SEC`** — time scale in the app (e.g., 1 “hour” = 60 s).
* **Tiers** — tweak `TIERS` for min SLOs and incident targets.
* **MWMB pairs** — thresholds & windows in `GOOGLE_MWMB` (short = long/12).
* **Policy toggle** — `bakeSLI`: when `true`, errors = unsuccessful **or** too slow.
* **SLO targets** — availability %, latency p95 ms.

---

## 🧾 Event schema (extended)

Every simulated event conforms to the Business Process Logging schema with **additional SLO‑aware fields** so you can distinguish business outcome from SLO compliance:

```json
{
  "logger": "business_process_logger",
  "flow": "order_to_cash",
  "event_type": "submit_payment",
  "is_successful": true,
  "is_slo_compliant": true,
  "slo_violations": [],
  "slo_thresholds": { "latency_ms": 800 },
  "origin_service": "on-frontend",
  "environment": "production",
  "latency_ms": 120,
  "status_code": 200,
  "additional_context": {
    "user_id": "user_1234",
    "country_iso_code": "DE",
    "currency_iso_code": "EUR",
    "language_iso_code": "en",
    "page_url": "/checkout",
    "error_code": null,
    "channel_type": "web"
  },
  "tracing_context": {
    "trace_id": "…",
    "session_id": "…",
    "on_uuid": "…",
    "request_id": "…"
  },
  "ts": 1733913600000
}
```

**Why both fields?**

* `is_successful` → business outcome.
* `is_slo_compliant` → whether the operation met the defined SLO (e.g., latency).

When **SLI‑baked** mode is on, burn‑rate calculations treat `!is_successful || !is_slo_compliant` as an error.

---

## 🛎️ Burn‑rate vs alternatives

* **MWMB burn‑rate** pages when the **short AND long windows** exceed a threshold (e.g., 14.4× for 1h/5m). Short window ensures it only fires while you’re **actively burning**.
* **Classic thresholds** (SLO breach, latency p95, CPU) are kept for comparison and runbook context, but **paging** can rely on burn‑rate to balance speed and noise.

---

## 🩺 Troubleshooting

* **Tailwind CLI error:** `could not determine executable to run` → Pin `tailwindcss@3` or use the CDN.
* **Alerts seem delayed:** The app triggers alert checks on data/state changes (not per‑second timers) to ensure **real‑time** updates during simulation.

---

## 🤝 Contributing

PRs and issues welcome! Please:

1. Open an issue describing the change.
2. Keep the single‑file app accessible (keyboard focus, reduced motion preferred).
3. Add or update self‑tests if you change burn‑rate math or windowing.

---


## 🙏 Credits

* **Author:** Ahmed Helil
* **Inspiration:** Google SRE practices on multi‑window, multi‑burn‑rate alerting.


# Apex Account Analytics & Excel Portfolio Intelligence

A full-stack financial analysis engine and interactive dashboard built for Post Office (DOP) and banking Excel account summaries (`.xls`, `.xlsx`, `.csv`).

## 🗂️ Source of truth (front end)
The front end exists twice in this repo: at the repo root (`index.html`, `app.js`, `styles.css`, `i18n.js`) and as byte-identical copies under `static/` (served by `server.py`; Vercel serves the root). **Edit the root files only, then copy them to `static/`** (`cp index.html app.js styles.css i18n.js static/`) so the two copies never drift apart. `portfolio_data.js` is likewise duplicated (root + `static/`).

## 🎨 Round 2 notes (branch `redesign/declutter-i18n-pdf` — declutter, languages, colourful PDF)
- **Declutter:** the main page has one clear hierarchy — hero valuation, KPI cards, scheme breakdown, maturity timeline, ledger. Secondary controls (interest rates, scheme/maturity filters) live behind a single **"More options"** disclosure instead of crowding the main view. Ambient glow decorations removed; section spacing opened up.
- **Languages:** EN / Marathi / Hindi switcher in the header (persisted in `localStorage` as `apex_lang`). Covers header, hero/KPI labels, upload area, filters, table headers, buttons, and print-report headings. See `i18n.js`.
- **Fonts — honest constraint:** Poppins has **no Devanagari glyphs**, so Poppins alone cannot render Marathi/Hindi. The font stack is `Poppins` (Latin) + `Noto Sans Devanagari` (Devanagari fallback), both loaded from Google Fonts, so Marathi/Hindi render correctly. Do not claim Poppins renders Devanagari.
- **Print / PDF:** colourful but official — indigo header band, colour-coded KPI cards (indigo / TD deep blue / RD plum / SB ochre), indigo table headers (round 3 palette; round 2 used teal, since replaced), repeating headers, page-break rules, and the footer line with valuation date, rates applied, and masked status. Numbers masked by default in print.
- **Dummy data on this branch only:** every full account number in `portfolio_data.js` on this branch was replaced with a clearly dummy `0000`-prefixed number of the same length, with masked forms recomputed to match. Verified: zero original full account numbers remain in either copy (root or `static/`). The `main` branch still holds the original file — do not merge this branch into `main` without deciding what should happen to the bundled data.

## 🎨 Round 3 notes (same branch — indigo palette, uploaded-data-only, per-type view + PDF, SWInfoSystems branding)
- **Colours (no green/teal anywhere):** primary deep indigo-blue `#1E40AF` (dark `#1E3A8A`); TD deep blue `#1D4ED8`, RD muted plum `#7C5C9E`, SB warm ochre `#A67C3D`. Gains/positive figures use indigo; losses use rose-red. The calm light theme is kept.
- **Simpler main page:** narrower 1200px content column, tighter hero, quieter cards. Features were reorganised, not removed.
- **Uploaded data replaces demo fully:** the moment a user uploads their own file, the demo dataset disappears from every view, KPI, table, chart, export and PDF. The status bar states the uploaded file name ("Showing your uploaded file: …") and offers **Restore demo** and **Clear upload**. Demo returns only when the user asks. Charts and the print waterfall are now computed from the actual records — no hardcoded demo years or values remain in the client.
- **Per-type View (single source of truth):** the View control (All / SB only / TD only / RD only) above the ledger drives the hero, KPI cards, ledger, charts and the PDF together. A TD-only view prints TD accounts with TD totals; the old parallel scheme dropdown was removed so no second filter can disagree with the PDF.
- **More functions:** per-type CSV export for the current view (filename carries the view), ledger sort (balance ↑/↓, maturity date, open date), a "Maturing in next 12 months" toggle, and a totals row above the ledger (count, balance, projected, interest for the current view).
- **SWInfoSystems branding + logo:** header, footer and PDF headers carry SWInfoSystems branding. The logo is one original inline SVG — a geometric apex/peak mark in indigo-blue with a plum inner peak and ochre apex dot — plus the "SWInfoSystems" wordmark and "Apex Wealth" product name. No external image, no other company's logo.
- **PDF sign-off (no forged signature):** every report ends with "For SWInfoSystems" (brand mark) and an "Authorised Signatory" line. No person's name is printed as signatory and no handwritten signature is invented. The print modal offers an optional PNG signature upload, stored only in the user's own browser localStorage (`apex_signature_png`, ≤1 MB); when provided, that image appears above the line, otherwise the line stays blank.

## 🎨 Round 4 notes (same branch — PDF report fully follows the selected language)
- **Bug fixed:** when the app language was Marathi or Hindi, the PDF report still printed large parts in English. Cause: the print builders in `app.js` had ~76 hardcoded English strings across all three report templates (DOP, MF, consolidated) even though the modal and screen were translated. All of them now route through `t()`; ~66 new keys were added to all three language packs in `i18n.js` (real Marathi/Hindi translations, not transliteration). Valuation dates localise per language (mr-IN / hi-IN / en-GB).
- **Print fonts:** `@media print` now uses the same stack as the screen — Poppins (Latin) + Noto Sans Devanagari fallback — so translated Devanagari renders in print, verified visually (no tofu boxes). Poppins has no Devanagari glyphs; the fallback does the work.
- **Language at print time:** the print builder calls `t()` live at click time against the currently selected language; nothing is cached at page load. Verified with a close-modal → switch language → reopen-modal → print flow (stale-language case).
- **Deliberate exceptions (proper nouns / names, by design):** the placeholder investor name "Portfolio Investor" (a name, same in all languages) and the fallback branch label "Regional Post Office S.O" (a proper-noun branch name, used only when uploaded data has no branch). Brand names (SWInfoSystems, Apex Wealth), numerals and currency stay as-is.
- **Verified:** synthetic-data-only PDFs for EN/MR/HI × DOP/consolidated (+ MF for MR/HI) plus the stale-language case — 9/9 pass text-extraction checks (Devanagari present in headings/KPI labels/table headers/footer/sign-off for MR/HI; no untranslated English UI strings; EN meaning unchanged). Evidence in `verification/` (r4-print-*.pdf, r4-visual-*.png, r4-modal-mr.png).

## 🎨 Rework notes (Nov 2026, local only — not pushed)
- Calm light theme is the default; dark remains a toggle. Theme, privacy-mask and interest-rate choices persist in `localStorage` (`apex_theme`, `apex_masked`, `apex_rates_v1`).
- One primary accent (superseded in round 3 by deep indigo-blue `#1E40AF`; TD deep blue, RD plum, SB ochre — no green/teal remains). 8pt spacing rhythm.
- New controls: editable RD/TD/SB rates (live recompute), scheme filter, maturity-year filter. Numbers are **masked by default** on screen and in print; full numbers need an explicit Unmask click.
- Print CSS: repeating table headers, no split KPI cards/rows, official footer line with the rates applied.
- Bug fixed: the client TD projection used a hardcoded 7.1% rate; it now uses the editable TD rate (default 6.9%, matching `server.py` and the print notes). RD/SB were already correct at 6.7%/4.0% and are now editable too.
- `analyze.py` now imports the real `parse_dop_summary` from `server.py` (the old `parse_account_summary_file` / `DEFAULT_FILE_PATH` never existed) and resolves its input from argv, `APEX_DOP_FILE`, or a local `AccountSummary*.xls`. `server.py` no longer crashes when its Windows file paths or FastAPI are absent.

## 📁 Source File Analyzed
- **Target File**: `C:\Users\swanv\Downloads\AccountSummary25-09-2026.xls`
- **Branch / Post Office**: Majalgaon S.O
- **Total Accounts**: 565 Active Accounts
- **Total Portfolio Value**: ₹5,36,756.00

---

## 🚀 How to Run & Use

### 1. Interactive Web Dashboard
The web server runs locally on **http://127.0.0.1:8080**:
```powershell
cd C:\Users\swanv\.gemini\antigravity-ide\scratch\excel-analyzer
python server.py
```
Open **[http://127.0.0.1:8080](http://127.0.0.1:8080)** in your browser to:
- Explore interactive charts (Scheme Breakdown Donut, Maturity Timeline, Vintage trends)
- Perform full-text search across account numbers, dates, and balances
- Filter by Time Deposits, Recurring Deposits, High-Value tiers, or Maturity Years
- Drag-and-drop any other `.xls` / `.xlsx` spreadsheet for instant analysis
- Export cleaned datasets to CSV or print official reports

### 2. Instant Terminal CLI Analysis
Run quick command-line summaries and export clean CSVs with:
```powershell
cd C:\Users\swanv\.gemini\antigravity-ide\scratch\excel-analyzer
python analyze.py
```

### 3. Clean CSV Export
The cleaned and normalized dataset is available at:
- `C:\Users\swanv\.gemini\antigravity-ide\scratch\excel-analyzer\account_summary_clean.csv`

---

## 📊 Summary Breakdown

| Scheme / Account Type | Account Count | Total Balance (₹) | Portfolio Share | Average / Account |
| :--- | :---: | :---: | :---: | :---: |
| **Time Deposit (1 Year)** | 62 | ₹4,50,000.00 | **83.84%** | ₹7,258.06 |
| **Recurring Deposit (RD)** | 502 | ₹50,200.00 | **9.35%** | ₹100.00 |
| **Savings Bank (SB)** | 1 | ₹36,556.00 | **6.81%** | ₹36,556.00 |
| **Total Portfolio** | **565** | **₹5,36,756.00** | **100.00%** | **₹950.01** |

---

## 📅 Maturity Timeline (Capital Realization)

- **2027**: 62 Time Deposits maturing (`₹4,50,000.00`)
- **2028**: 20 Recurring Deposits maturing (`₹2,000.00`)
- **2029**: 116 Recurring Deposits maturing (`₹11,600.00`)
- **2030**: 210 Recurring Deposits maturing (`₹21,000.00`)
- **2031**: 156 Recurring Deposits maturing (`₹15,600.00`)

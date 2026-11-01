# Apex Account Analytics & Excel Portfolio Intelligence

A full-stack financial analysis engine and interactive dashboard built for Post Office (DOP) and banking Excel account summaries (`.xls`, `.xlsx`, `.csv`).

## 🗂️ Source of truth (front end)
The front end exists twice in this repo: at the repo root (`index.html`, `app.js`, `styles.css`, `i18n.js`) and as byte-identical copies under `static/` (served by `server.py`; Vercel serves the root). **Edit the root files only, then copy them to `static/`** (`cp index.html app.js styles.css i18n.js static/`) so the two copies never drift apart. `portfolio_data.js` is likewise duplicated (root + `static/`).

## 🎨 Round 2 notes (branch `redesign/declutter-i18n-pdf` — declutter, languages, colourful PDF)
- **Declutter:** the main page has one clear hierarchy — hero valuation, KPI cards, scheme breakdown, maturity timeline, ledger. Secondary controls (interest rates, scheme/maturity filters) live behind a single **"More options"** disclosure instead of crowding the main view. Ambient glow decorations removed; section spacing opened up.
- **Languages:** EN / Marathi / Hindi switcher in the header (persisted in `localStorage` as `apex_lang`). Covers header, hero/KPI labels, upload area, filters, table headers, buttons, and print-report headings. See `i18n.js`.
- **Fonts — honest constraint:** Poppins has **no Devanagari glyphs**, so Poppins alone cannot render Marathi/Hindi. The font stack is `Poppins` (Latin) + `Noto Sans Devanagari` (Devanagari fallback), both loaded from Google Fonts, so Marathi/Hindi render correctly. Do not claim Poppins renders Devanagari.
- **Print / PDF:** colourful but official — teal header band, colour-coded KPI cards (teal / TD slate-blue / RD sage / SB ochre), teal table headers, repeating headers, page-break rules, and the footer line with valuation date, rates applied, and masked status. Numbers masked by default in print.
- **Dummy data on this branch only:** every full account number in `portfolio_data.js` on this branch was replaced with a clearly dummy `0000`-prefixed number of the same length, with masked forms recomputed to match. Verified: zero original full account numbers remain in either copy (root or `static/`). The `main` branch still holds the original file — do not merge this branch into `main` without deciding what should happen to the bundled data.

## 🎨 Rework notes (Nov 2026, local only — not pushed)
- Calm light theme is the default; dark remains a toggle. Theme, privacy-mask and interest-rate choices persist in `localStorage` (`apex_theme`, `apex_masked`, `apex_rates_v1`).
- One primary accent (teal `#0F766E`); muted scheme colours — TD slate-blue, RD sage, SB ochre. 8pt spacing rhythm.
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

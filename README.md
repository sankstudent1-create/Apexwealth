# Apex Account Analytics & Excel Portfolio Intelligence

A full-stack financial analysis engine and interactive dashboard built for Post Office (DOP) and banking Excel account summaries (`.xls`, `.xlsx`, `.csv`).

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

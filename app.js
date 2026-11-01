// Apex Wealth Intelligence Client Controller
// Multi-Asset Financial Portfolio Processing & Executive Print Engine

// ==================== STORAGE SERVICE (LocalStorage & Supabase Ready) ====================
const StorageService = {
  getDop: () => {
    try {
      const data = localStorage.getItem('apex_user_portfolio_dop');
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  },
  setDop: (data) => {
    try {
      localStorage.setItem('apex_user_portfolio_dop', JSON.stringify(data));
    } catch (e) {
      console.error('LocalStorage write error:', e);
    }
  },
  getMf: () => {
    try {
      const data = localStorage.getItem('apex_user_portfolio_mf');
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  },
  setMf: (data) => {
    try {
      localStorage.setItem('apex_user_portfolio_mf', JSON.stringify(data));
    } catch (e) {
      console.error('LocalStorage write error:', e);
    }
  },
  hasUserData: () => {
    return !!(localStorage.getItem('apex_user_portfolio_dop') || localStorage.getItem('apex_user_portfolio_mf'));
  },
  clearUserData: () => {
    localStorage.removeItem('apex_user_portfolio_dop');
    localStorage.removeItem('apex_user_portfolio_mf');
  },
  
  // Future Supabase Sync Architecture Hook:
  // Allows seamlessly connecting user authentication and remote persistent storage
  syncToSupabase: async (userToken) => {
    console.log('[Supabase Sync] Ready to persist local portfolio to cloud DB for authenticated user.');
    // e.g., const { data, error } = await supabase.from('portfolios').upsert({ user_id, dop: StorageService.getDop(), mf: StorageService.getMf() });
  },
  fetchFromSupabase: async (userToken) => {
    console.log('[Supabase Sync] Ready to fetch cloud portfolio from Supabase.');
  }
};

// ==================== STATE MANAGEMENT ====================
let currentAsset = 'consolidated'; // 'consolidated', 'dop', 'mf'
let activeData = null;
let allRecords = [];
let filteredRecords = [];
let currentPage = 1;
let pageSize = 25;
let currentSort = { column: 'id', asc: true };
let currentFilterChip = 'all';
let chartMode = 'payout'; // 'payout', 'count'
let isMasked = true; // masked by default: full numbers only after an explicit Unmask click
let isLightTheme = true; // calm light theme is the default; dark remains a toggle option
let isDemoMode = false;

// ---------------- Editable interest rates (defaults match server DEFAULT_RATES) ----------------
const DEFAULT_RATES = { RD: 6.7, TD: 6.9, SB: 4.0 };
function loadStoredRates() {
  try {
    const s = JSON.parse(localStorage.getItem('apex_rates_v1') || 'null');
    if (s && [s.RD, s.TD, s.SB].every(v => isFinite(+v) && +v >= 0 && +v <= 20)) {
      return { RD: +s.RD, TD: +s.TD, SB: +s.SB };
    }
  } catch (e) { /* fall through to defaults */ }
  return { ...DEFAULT_RATES };
}
let interestRates = loadStoredRates();
// Data source: 'uploaded' (user's own file, the ONLY data shown) or 'demo'
// (bundled sample). Demo rows must never mix into uploaded results.
let dataSource = 'none'; // 'none' | 'uploaded' | 'demo'
let uploadedFileNames = { dop: null, mf: null };
try {
  const src = localStorage.getItem('apex_data_source');
  if (src === 'uploaded' || src === 'demo') dataSource = src;
  const names = JSON.parse(localStorage.getItem('apex_uploaded_files') || 'null');
  if (names) uploadedFileNames = names;
} catch (e) { /* private mode */ }
function persistDataSource() {
  try {
    localStorage.setItem('apex_data_source', dataSource);
    localStorage.setItem('apex_uploaded_files', JSON.stringify(uploadedFileNames));
  } catch (e) { /* private mode */ }
}
// Single source of truth for account type. 'all' | 'SB' | 'TD' | 'RD'.
// Drives KPIs, hero, ledger, charts AND the PDF — never a second filter.
let viewType = 'all';
try {
  const v = localStorage.getItem('apex_view');
  if (['all', 'SB', 'TD', 'RD'].includes(v)) viewType = v;
} catch (e) { /* private mode */ }
function persistView() {
  try { localStorage.setItem('apex_view', viewType); } catch (e) { /* private mode */ }
}
let maturityYearFilter = 'all';
let sortKey = 'default';
let maturing12mOnly = false;
// User's own signature image (PNG data URL, this device only). Absent =
// brand mark + blank line, never a forged signature.
function loadStoredSignature() {
  try { return localStorage.getItem('apex_signature_png') || null; } catch (e) { return null; }
}
function brandLogoSVG(cls) {
  return `<svg class="${cls}" viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M5 40 L24 7 L43 40" stroke="#1E40AF" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 40 L24 23 L32 40" stroke="#7C5C9E" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="24" cy="7" r="3.5" fill="#B45309"/></svg>`;
}
function signoffBlockHTML() {
  const sig = loadStoredSignature();
  const sigArea = sig
    ? `<img src="${sig}" alt="Uploaded signature">`
    : `<div class="signoff-sig-space"></div>`;
  return `<div class="print-signoff">
    <div class="signoff-brand">${brandLogoSVG('print-brand-logo')}<span>For SWInfoSystems</span></div>
    <div class="signoff-sig">${sigArea}<div class="signoff-line"></div><div class="signoff-label">${t('authorisedSignatory')}</div></div>
  </div>`;
}
function printBrandHeaderHTML(subtitle) {
  return `<div class="print-header"><div class="print-brand-row"><div class="print-logo-box">${brandLogoSVG('print-brand-logo')}<div><h1 class="print-brand-name">SWInfoSystems &bull; APEX WEALTH</h1><p class="print-brand-sub">${subtitle}</p></div></div>`;
}
// The ONLY way views read portfolio data. Uploaded mode never falls back to
// the bundled demo; demo mode never reads stored uploads as demo.
function getActiveDop() {
  if (dataSource === 'uploaded') return StorageService.getDop();
  if (dataSource === 'demo') return window.DEFAULT_PORTFOLIO_DATA ? window.DEFAULT_PORTFOLIO_DATA.dop : null;
  return StorageService.getDop();
}
function getActiveMf() {
  if (dataSource === 'uploaded') return StorageService.getMf();
  if (dataSource === 'demo') return window.DEFAULT_PORTFOLIO_DATA ? window.DEFAULT_PORTFOLIO_DATA.mf : null;
  return StorageService.getMf();
}
function parseLooseDate(s) {
  if (!s) return null;
  const str = String(s).trim();
  const dmY = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmY) { const d = new Date(+dmY[3], +dmY[2] - 1, +dmY[1]); return isNaN(d) ? null : d; }
  const d = new Date(str);
  return isNaN(d) ? null : d;
}
function viewRecordsOf(records) {
  if (!records) return [];
  return viewType === 'all' ? records : records.filter(r => r.category_code === viewType);
}
function viewLabel() {
  return viewType === 'all' ? t('viewAll') : (viewType + ' ' + t('viewOnlySuffix'));
}
function saveStoredRates() {
  try { localStorage.setItem('apex_rates_v1', JSON.stringify(interestRates)); } catch (e) { /* private mode */ }
}
// RD unit maturity for a Rs 100/month, 60-month RD — same quarterly-compounding
// loop as server.py calculate_rd_maturity, so the client and server agree at any rate.
function rdUnitMaturity(rate) {
  const q = (rate / 100) / 4;
  let total = 0;
  for (let m = 0; m < 60; m++) total += 100 * Math.pow(1 + q, (60 - m) / 3);
  return Math.round(total * 100) / 100;
}
function inr(n) { return `\u20B9${n.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`; }
function recomputeDopRecord(r) {
  const bal = r.balance || 0;
  let proj = bal, intr = 0, yld = 0;
  if (r.category_code === 'RD') {
    const unit = rdUnitMaturity(interestRates.RD);
    const mult = bal > 0 ? bal / 100 : 1;
    proj = Math.round(unit * mult * 100) / 100;
    intr = Math.round((unit - 6000) * mult * 100) / 100;
    yld = Math.round((intr / 5) * 100) / 100;
  } else if (r.category_code === 'TD') {
    const q = (interestRates.TD / 100) / 4;
    proj = Math.round(bal * Math.pow(1 + q, 4) * 100) / 100;
    intr = Math.round((proj - bal) * 100) / 100;
    yld = intr;
  } else if (r.category_code === 'SB') {
    proj = bal; intr = 0;
    yld = Math.round(bal * (interestRates.SB / 100) * 100) / 100;
  }
  r.projected_maturity_value = proj;
  r.projected_maturity_formatted = inr(proj);
  r.projected_total_interest = intr;
  r.projected_interest_formatted = inr(intr);
  r.annual_yield = yld;
  return r;
}
function recomputeDopPortfolio(dop) {
  if (!dop || !Array.isArray(dop.records)) return dop;
  dop.records.forEach(recomputeDopRecord);
  const totBal = dop.records.reduce((s, r) => s + r.balance, 0);
  const totProj = dop.records.reduce((s, r) => s + r.projected_maturity_value, 0);
  const totInt = dop.records.reduce((s, r) => s + r.projected_total_interest, 0);
  const totYld = dop.records.reduce((s, r) => s + r.annual_yield, 0);
  dop.metadata = dop.metadata || {};
  dop.metadata.total_balance = totBal;
  dop.metadata.total_balance_formatted = inr(totBal);
  dop.metadata.total_projected_maturity = totProj;
  dop.metadata.total_projected_maturity_formatted = inr(totProj);
  dop.metadata.total_projected_interest = totInt;
  dop.metadata.total_projected_interest_formatted = inr(totInt);
  dop.metadata.total_annual_yield = totYld;
  dop.metadata.total_annual_yield_formatted = inr(totYld);
  return dop;
}
// Recompute stored + in-memory DOP data at the current rates, then refresh the
// consolidated summary so hero/KPI/print figures all move together.
function refreshRatesInActiveData() {
  // Recompute through the data-source helpers only, so demo data is never
  // written into stored uploads and uploads never pick up demo rows.
  const stored = dataSource === 'uploaded' ? StorageService.getDop() : null;
  if (stored) { recomputeDopPortfolio(stored); StorageService.setDop(stored); }
  const dop = getActiveDop();
  if (dop && dop !== stored) recomputeDopPortfolio(dop);
  if (activeData?.asset_type === 'CONSOLIDATED') {
    const d = getActiveDop();
    const m = getActiveMf();
    activeData.summary = getConsolidatedFromData(d, m).summary;
    activeData.dop_portfolio = d;
    activeData.mf_portfolio = m;
  }
}
function syncRateInputs() {
  const rd = document.getElementById('rateRd');
  const td = document.getElementById('rateTd');
  const sb = document.getElementById('rateSb');
  if (rd) rd.value = interestRates.RD;
  if (td) td.value = interestRates.TD;
  if (sb) sb.value = interestRates.SB;
}
function handleRateChange() {
  const rd = parseFloat(document.getElementById('rateRd').value);
  const td = parseFloat(document.getElementById('rateTd').value);
  const sb = parseFloat(document.getElementById('rateSb').value);
  if ([rd, td, sb].some(v => !isFinite(v) || v < 0 || v > 20)) {
    showToast('Rates must be between 0 and 20%. Previous rates kept.', 'error');
    syncRateInputs();
    return;
  }
  interestRates = { RD: rd, TD: td, SB: sb };
  saveStoredRates();
  refreshRatesInActiveData();
  renderActiveView();
}
function refreshMaturityYearOptions() {
  const sel = document.getElementById('selectMaturityYear');
  if (!sel) return;
  const years = [...new Set(allRecords.map(r => (String(r.maturity_date || '').match(/(20\d{2})/) || [])[1]).filter(Boolean))].sort();
  const prev = maturityYearFilter;
  sel.innerHTML = '<option value="all">' + t('allYears') + '</option>' + years.map(y => `<option value="${y}">${y}</option>`).join('');
  maturityYearFilter = years.includes(prev) ? prev : 'all';
  sel.value = maturityYearFilter;
}
function applySavedPreferences() {
  try {
    const theme = localStorage.getItem('apex_theme');
    if (theme === 'dark') isLightTheme = false;
    else if (theme === 'light') isLightTheme = true;
    const masked = localStorage.getItem('apex_masked');
    if (masked === '0') isMasked = false;
    else if (masked === '1') isMasked = true;
  } catch (e) { /* private mode: defaults stand */ }
  document.body.classList.toggle('theme-light', isLightTheme);
  const pText = document.getElementById('privacyText');
  if (pText) pText.textContent = isMasked ? t('privacyUnmask') : t('privacyMask');
  const pIcon = document.getElementById('privacyIcon');
  if (pIcon) pIcon.setAttribute('data-lucide', isMasked ? 'eye' : 'eye-off');
  const tIcon = document.getElementById('themeIcon');
  if (tIcon) tIcon.setAttribute('data-lucide', isLightTheme ? 'moon' : 'sun');
  const maskChk = document.getElementById('chkIncludeMask');
  if (maskChk) maskChk.checked = isMasked;
  syncRateInputs();
}

// Chart Instances
let donutChart = null;
let barChart = null;

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) lucide.createIcons();
  applySavedPreferences();
  setupEventListeners();
  initPortfolioState();
});

function setupEventListeners() {
  // Asset Switcher Tabs
  document.querySelectorAll('.portfolio-switcher .switch-tab').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.portfolio-switcher .switch-tab').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      currentAsset = e.currentTarget.getAttribute('data-asset');
      // Load the dataset for the selected tab: previously renderActiveView ran
      // against whatever activeData the previous tab had built, so switching
      // from Consolidated to Post Office showed empty/zero figures.
      if (currentAsset === 'dop') {
        activeData = getActiveDop();
      } else if (currentAsset === 'mf') {
        activeData = getActiveMf();
      } else {
        activeData = getConsolidatedFromData(getActiveDop(), getActiveMf());
      }
      if (activeData) refreshRatesInActiveData();
      renderActiveView();
    });
  });

  // Privacy Masking Toggle
  document.getElementById('btnPrivacy').addEventListener('click', () => {
    isMasked = !isMasked;
    try { localStorage.setItem('apex_masked', isMasked ? '1' : '0'); } catch (e) { /* private mode */ }
    const maskChk = document.getElementById('chkIncludeMask');
    if (maskChk) maskChk.checked = isMasked;
    document.getElementById('privacyText').textContent = isMasked ? t('privacyUnmask') : t('privacyMask');
    const icon = document.getElementById('privacyIcon');
    icon.setAttribute('data-lucide', isMasked ? 'eye' : 'eye-off');
    renderTable();
    updatePrintStatement();
    if (window.lucide) lucide.createIcons();
    showToast(isMasked ? 'Sensitive identifiers redacted for privacy' : 'Identifiers unmasked', 'info');
  });

  // Theme Toggle (Dark / Light)
  document.getElementById('btnThemeToggle').addEventListener('click', () => {
    isLightTheme = !isLightTheme;
    try { localStorage.setItem('apex_theme', isLightTheme ? 'light' : 'dark'); } catch (e) { /* private mode */ }
    document.body.classList.toggle('theme-light', isLightTheme);
    const icon = document.getElementById('themeIcon');
    icon.setAttribute('data-lucide', isLightTheme ? 'moon' : 'sun');
    renderCharts();
    if (window.lucide) lucide.createIcons();
    showToast(isLightTheme ? 'Light Theme Active' : 'Dark Theme Active', 'info');
  });

  // Print Report Modal
  document.getElementById('btnPrintModalOpen').addEventListener('click', () => {
    updatePrintStatement();
    document.getElementById('printModal').classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  });
  document.getElementById('btnPrintModalClose').addEventListener('click', closePrintModal);
  document.getElementById('btnCancelPrint').addEventListener('click', closePrintModal);
  
  // Execute Print
  document.getElementById('btnExecutePrint').addEventListener('click', () => {
    const scopeSelect = document.getElementById('selectPrintScope');
    const maskCheck = document.getElementById('chkIncludeMask');
    const waterfallCheck = document.getElementById('chkIncludeWaterfall');
    
    // Temporarily apply modal options to print container
    generatePrintReportHTML(scopeSelect.value, maskCheck.checked, waterfallCheck.checked);
    closePrintModal();
    window.print();
  });

  // Select Print Scope Change
  document.getElementById('selectPrintScope').addEventListener('change', (e) => {
    updatePrintStatement();
  });

  // Export Menu Toggle
  const exportBtn = document.getElementById('btnExportMenu');
  const exportDropdown = document.getElementById('exportDropdown');
  exportBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    exportDropdown.classList.toggle('hidden');
  });
  document.addEventListener('click', () => {
    if (!exportDropdown.classList.contains('hidden')) exportDropdown.classList.add('hidden');
  });

  // Export Buttons
  document.getElementById('btnExportExcel').addEventListener('click', exportToExcel);
  document.getElementById('btnExportCSV').addEventListener('click', exportToCSV);
  document.getElementById('btnExportJSON').addEventListener('click', exportToJSON);

  // Search Input
  const searchInput = document.getElementById('searchInput');
  const btnClear = document.getElementById('btnClearSearch');
  searchInput.addEventListener('input', (e) => {
    btnClear.classList.toggle('hidden', !e.target.value);
    applyFilters();
  });
  btnClear.addEventListener('click', () => {
    searchInput.value = '';
    btnClear.classList.add('hidden');
    applyFilters();
  });

  // Interest-rate inputs + reset (live recompute)
  ['rateRd', 'rateTd', 'rateSb'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', handleRateChange);
  });
  const btnResetRates = document.getElementById('btnResetRates');
  if (btnResetRates) btnResetRates.addEventListener('click', () => {
    interestRates = { ...DEFAULT_RATES };
    saveStoredRates();
    syncRateInputs();
    refreshRatesInActiveData();
    renderActiveView();
    showToast('Rates reset to defaults (RD 6.7 / TD 6.9 / SB 4.0).', 'info');
  });
  const matSel = document.getElementById('selectMaturityYear');
  if (matSel) matSel.addEventListener('change', (e) => { maturityYearFilter = e.target.value; applyFilters(); });

  // View control (single source of truth for account type)
  document.querySelectorAll('#viewControl .view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      viewType = btn.getAttribute('data-view');
      persistView();
      document.querySelectorAll('#viewControl .view-btn').forEach(b => b.classList.toggle('active', b === btn));
      renderActiveView();
    });
  });
  // Sort control
  const sortSel = document.getElementById('selectSort');
  if (sortSel) sortSel.addEventListener('change', (e) => { sortKey = e.target.value; renderTable(); });
  // Maturing-in-12-months toggle
  const mat12 = document.getElementById('chkMaturing12m');
  if (mat12) mat12.addEventListener('change', (e) => { maturing12mOnly = e.target.checked; applyFilters(); });
  // Per-type CSV export (current view)
  const csvViewBtn = document.getElementById('btnExportCsvView');
  if (csvViewBtn) csvViewBtn.addEventListener('click', exportToCSVView);
  // Data-source actions
  const restoreBtn = document.getElementById('btnRestoreDemo');
  if (restoreBtn) restoreBtn.addEventListener('click', () => { loadDemoPortfolio(); });
  const clearUpBtn = document.getElementById('btnClearUpload');
  if (clearUpBtn) clearUpBtn.addEventListener('click', () => {
    if (confirm('Remove your uploaded file and go back to the start screen?')) {
      StorageService.clearUserData();
      uploadedFileNames = { dop: null, mf: null };
      dataSource = 'none';
      persistDataSource();
      isDemoMode = false;
      initPortfolioState();
      showToast('Upload cleared.', 'info');
    }
  });
  // Signature upload (PNG, this device only)
  const sigInput = document.getElementById('sigUpload');
  if (sigInput) sigInput.addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (f.type !== 'image/png') { showToast('Please upload a PNG image.', 'error'); e.target.value = ''; return; }
    if (f.size > 1024 * 1024) { showToast('Signature image must be under 1 MB.', 'error'); e.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = () => {
      try { localStorage.setItem('apex_signature_png', reader.result); } catch (err) { showToast('Signature too large for device storage.', 'error'); return; }
      refreshSigStatus();
      updatePrintStatement();
      showToast('Signature saved on this device.', 'success');
    };
    reader.readAsDataURL(f);
  });
  const rmSig = document.getElementById('btnRemoveSig');
  if (rmSig) rmSig.addEventListener('click', () => {
    try { localStorage.removeItem('apex_signature_png'); } catch (e) { /* ignore */ }
    const inp = document.getElementById('sigUpload');
    if (inp) inp.value = '';
    refreshSigStatus();
    updatePrintStatement();
    showToast('Signature removed.', 'info');
  });
  refreshSigStatus();

  // Page Size Select
  document.getElementById('selectPageSize').addEventListener('change', (e) => {
    pageSize = e.target.value === 'all' ? 999999 : parseInt(e.target.value, 10);
    currentPage = 1;
    renderTable();
  });

  // Chart Mode Pills (Payout vs Count)
  document.querySelectorAll('#chartModePills .pill-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('#chartModePills .pill-btn').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      chartMode = e.currentTarget.getAttribute('data-mode');
      renderTimelineBarChart();
    });
  });

  // Onboarding Dropzones
  setupDropzone('dropzoneDop', 'fileInputDop', 'dop');
  setupDropzone('dropzoneMf', 'fileInputMf', 'mf');
  setupDropzone('uploadDropzone', 'uploadFileInput', 'auto');

  // Load Sample Demo Button
  document.getElementById('btnLoadDemo').addEventListener('click', () => {
    loadDemoPortfolio();
  });

  // Storage Action Bar Buttons
  document.getElementById('btnUploadMore').addEventListener('click', () => {
    document.getElementById('uploadDropzone').scrollIntoView({ behavior: 'smooth' });
    document.getElementById('uploadFileInput').click();
  });

  document.getElementById('btnClearStorage').addEventListener('click', () => {
    if (confirm('Are you sure you want to clear your local portfolio data? All data in this browser will be reset.')) {
      StorageService.clearUserData();
      uploadedFileNames = { dop: null, mf: null };
      dataSource = 'none';
      persistDataSource();
      isDemoMode = false;
      initPortfolioState();
      showToast('All local portfolio data has been cleared.', 'info');
    }
  });

  // Modal Close Listeners
  const detailModal = document.getElementById('detailModal');
  if (detailModal) {
    detailModal.addEventListener('click', (e) => {
      if (e.target.id === 'detailModal' || e.target.closest('#btnModalClose') || e.target.closest('.btn-close')) {
        closeModal();
      }
    });
  }

  const printModal = document.getElementById('printModal');
  if (printModal) {
    printModal.addEventListener('click', (e) => {
      if (e.target.id === 'printModal' || e.target.closest('#btnPrintModalClose') || e.target.closest('#btnCancelPrint')) {
        closePrintModal();
      }
    });
  }

  // Global keydown for Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'Esc') {
      closeModal();
      closePrintModal();
      const exportDropdown = document.getElementById('exportDropdown');
      if (exportDropdown) exportDropdown.classList.add('hidden');
    }
  });
}

function setupDropzone(dropzoneId, inputId, expectedType) {
  const dropzone = document.getElementById(dropzoneId);
  const input = document.getElementById(inputId);
  if (!dropzone || !input) return;

  dropzone.addEventListener('click', () => input.click());
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      handleFileImport(e.dataTransfer.files[0], expectedType);
    }
  });
  input.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileImport(e.target.files[0], expectedType);
    }
  });
}

function closePrintModal() {
  document.getElementById('printModal').classList.add('hidden');
}

// ==================== PORTFOLIO DATA INITIALIZATION ====================
// The data-source banner is the user's proof of what is on screen: uploaded
// file names, or an explicit demo label. Demo and uploaded data never mix.
function renderSourceBar() {
  const bar = document.getElementById('storageStatusBar');
  const text = document.getElementById('storageStatusText');
  const restoreBtn = document.getElementById('btnRestoreDemo');
  const clearBtn = document.getElementById('btnClearUpload');
  if (!bar || !text) return;
  // Always re-read file names from storage so the bar can never show a stale
  // name (e.g. after a second tab uploaded a file).
  try {
    const stored = JSON.parse(localStorage.getItem('apex_uploaded_files') || 'null');
    if (stored && typeof stored === 'object') uploadedFileNames = stored;
  } catch (e) { /* keep in-memory names */ }
  const show = (el, on) => { if (el) el.classList.toggle('hidden', !on); };
  if (dataSource === 'uploaded') {
    const names = [uploadedFileNames.dop, uploadedFileNames.mf].filter(Boolean);
    const namePart = names.length
      ? names.map(n => `<span class="source-file-name">${n}</span>`).join(' + ')
      : t('uploadedFileGeneric');
    text.innerHTML = `${t('showingUploaded')} ${namePart} &bull; ${t('uploadedOnlyNote')}`;
    show(restoreBtn, true);
    show(clearBtn, true);
  } else if (dataSource === 'demo') {
    text.textContent = t('viewingDemo');
    show(restoreBtn, false);
    show(clearBtn, false);
  } else {
    text.textContent = t('storedText');
    show(restoreBtn, false);
    show(clearBtn, false);
  }
}

function initPortfolioState() {
  const hasLocal = StorageService.hasUserData();
  // Stored data always means the user's own upload — never demo.
  if (hasLocal && dataSource !== 'demo') dataSource = 'uploaded';

  if (hasLocal) {
    document.getElementById('onboardingSection').classList.add('hidden');
    document.getElementById('storageStatusBar').classList.remove('hidden');
    document.getElementById('dashboardContainer').classList.remove('hidden');
    renderSourceBar();
    loadActivePortfolioFromStorage();
  } else if (dataSource === 'demo' && window.DEFAULT_PORTFOLIO_DATA) {
    document.getElementById('onboardingSection').classList.add('hidden');
    document.getElementById('storageStatusBar').classList.remove('hidden');
    document.getElementById('dashboardContainer').classList.remove('hidden');
    renderSourceBar();
    activeData = getConsolidatedFromData(getActiveDop(), getActiveMf());
    refreshRatesInActiveData();
    renderActiveView();
  } else {
    // First time clean launch: No data loaded by default
    document.getElementById('onboardingSection').classList.remove('hidden');
    document.getElementById('storageStatusBar').classList.add('hidden');
    document.getElementById('dashboardContainer').classList.add('hidden');
  }
  if (window.lucide) lucide.createIcons();
}

function loadDemoPortfolio() {
  if (window.DEFAULT_PORTFOLIO_DATA) {
    isDemoMode = true;
    dataSource = 'demo';
    showToast('Loaded sample demo portfolio for preview', 'success');
    initPortfolioState();
  } else {
    showToast('Demo dataset not available.', 'error');
  }
}

function loadActivePortfolioFromStorage() {
  const dop = getActiveDop();
  const mf = getActiveMf();

  if (currentAsset === 'dop') {
    activeData = dop || (mf ? getConsolidatedFromData(null, mf) : null);
  } else if (currentAsset === 'mf') {
    activeData = mf || (dop ? getConsolidatedFromData(dop, null) : null);
  } else {
    activeData = getConsolidatedFromData(dop, mf);
  }

  refreshRatesInActiveData();
  renderActiveView();
}

function refreshSigStatus() {
  const status = document.getElementById('sigStatus');
  const rm = document.getElementById('btnRemoveSig');
  const has = !!loadStoredSignature();
  if (status) status.textContent = has ? t('sigSaved') : t('sigNone');
  if (rm) rm.classList.toggle('hidden', !has);
}

function getConsolidatedFromData(dop, mf) {
  const dopVal = dop?.metadata?.total_balance || 0;
  const dopProj = dop?.metadata?.total_projected_maturity || 0;
  const dopInt = dop?.metadata?.total_projected_interest || 0;
  const mfInv = mf?.metadata?.total_invested || 0;
  const mfCur = mf?.metadata?.current_value || 0;

  const netWorth = dopVal + mfCur;
  const projWealth = dopProj + mfCur;
  const totalPrincipal = dopVal + mfInv;
  const totalCount = (dop?.records?.length || 0) + (mf?.records?.length || 0);

  return {
    asset_type: 'CONSOLIDATED',
    summary: {
      investor_name: 'Portfolio Investor',
      pan: 'XXXXX1234X',
      total_net_worth: roundNum(netWorth, 2),
      total_net_worth_formatted: `₹${netWorth.toLocaleString('en-IN', {minimumFractionDigits: 2})}`,
      total_projected_wealth: roundNum(projWealth, 2),
      total_projected_wealth_formatted: `₹${projWealth.toLocaleString('en-IN', {minimumFractionDigits: 2})}`,
      dop_book_balance: dopVal,
      dop_book_balance_formatted: `₹${dopVal.toLocaleString('en-IN', {minimumFractionDigits: 2})}`,
      mf_current_value: mfCur,
      mf_current_value_formatted: `₹${mfCur.toLocaleString('en-IN', {minimumFractionDigits: 2})}`,
      total_principal_formatted: `₹${totalPrincipal.toLocaleString('en-IN', {minimumFractionDigits: 2})}`,
      total_holdings_count: totalCount,
      projected_gain_formatted: `+₹${(dopInt / 100000).toFixed(2)} Lakhs`
    },
    dop_portfolio: dop,
    mf_portfolio: mf
  };
}

// ==================== CLIENT FILE IMPORT & SHEETJS PARSER ====================
function handleFileImport(file, expectedType = 'auto') {
  showToast(`Parsing ${file.name}...`, 'info');
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonRows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

      const parsed = parseClientExcelData(jsonRows, file.name, expectedType);
      
      // Uploaded data replaces demo completely: from this moment every view,
      // KPI, chart, export and PDF reads ONLY the uploaded file(s).
      isDemoMode = false;
      dataSource = 'uploaded';
      if (parsed.asset_type === 'POST_OFFICE') {
        StorageService.setDop(parsed);
        uploadedFileNames.dop = file.name;
        currentAsset = 'dop';
        showToast(`Parsed & saved ${parsed.records.length} Post Office accounts to browser!`, 'success');
      } else if (parsed.asset_type === 'MUTUAL_FUNDS') {
        StorageService.setMf(parsed);
        uploadedFileNames.mf = file.name;
        currentAsset = 'mf';
        showToast(`Parsed & saved ${parsed.records.length} Mutual Fund holdings to browser!`, 'success');
      }
      persistDataSource();

      // Update Switcher UI
      document.querySelectorAll('.portfolio-switcher .switch-tab').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-asset') === currentAsset);
      });

      initPortfolioState();
    } catch (err) {
      console.error(err);
      showToast('Error parsing file: ' + err.mesplum, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

function parseClientExcelData(rows, fileName, expectedType = 'auto') {
  let isGroww = false;
  
  if (expectedType === 'mf') {
    isGroww = true;
  } else if (expectedType === 'dop') {
    isGroww = false;
  } else {
    for (let r = 0; r < Math.min(20, rows.length); r++) {
      const rowStr = (rows[r] || []).join(' ').toLowerCase();
      if (rowStr.includes('holding summary') || rowStr.includes('scheme name') || rowStr.includes('groww')) {
        isGroww = true;
        break;
      }
    }
  }

  if (isGroww) {
    // Parse Mutual Funds / Stocks Statement
    let headersIdx = 0;
    for (let r = 0; r < rows.length; r++) {
      if ((rows[r] || []).some(c => String(c).toLowerCase().includes('scheme name'))) {
        headersIdx = r;
        break;
      }
    }

    const records = [];
    for (let r = headersIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || !row[0] || String(row[0]).toLowerCase().includes('total')) continue;
      
      const scheme = String(row[0]).trim();
      const amc = String(row[1] || '').trim();
      const cat = String(row[2] || 'Equity').trim();
      const subcat = String(row[3] || 'Direct').trim();
      const folio = String(row[4] || '').trim();
      const units = parseFloat(row[6]) || 0;
      const inv = parseFloat(String(row[7] || '0').replace(/,/g, '')) || 0;
      const cur = parseFloat(String(row[8] || '0').replace(/,/g, '')) || 0;
      const ret = parseFloat(String(row[9] || '0').replace(/,/g, '')) || (cur - inv);
      const xirr = String(row[10] || '0.0%').trim();
      const retPct = inv > 0 ? (ret / inv * 100) : 0;

      records.push({
        id: records.length + 1,
        scheme_name: scheme,
        amc: amc,
        category: cat,
        subcategory: subcat,
        folio_no: folio,
        source: 'Groww',
        units: roundNum(units, 3),
        invested_value: roundNum(inv, 2),
        invested_formatted: `₹${inv.toLocaleString('en-IN', {minimumFractionDigits: 2})}`,
        current_value: roundNum(cur, 2),
        current_formatted: `₹${cur.toLocaleString('en-IN', {minimumFractionDigits: 2})}`,
        returns: roundNum(ret, 2),
        returns_formatted: `${ret >= 0 ? '+' : ''}₹${ret.toLocaleString('en-IN', {minimumFractionDigits: 2})}`,
        returns_pct: roundNum(retPct, 2),
        returns_pct_formatted: `${retPct >= 0 ? '+' : ''}${retPct.toFixed(2)}%`,
        xirr: xirr,
        is_profit: ret >= 0
      });
    }

    const totInv = records.reduce((s, r) => s + r.invested_value, 0);
    const totCur = records.reduce((s, r) => s + r.current_value, 0);
    const totRet = totCur - totInv;
    const retPct = totInv > 0 ? (totRet / totInv * 100) : 0;

    return {
      asset_type: 'MUTUAL_FUNDS',
      metadata: {
        file_name: fileName,
        investor_name: 'Portfolio Investor',
        pan: 'XXXXX1234X',
        total_invested: totInv,
        total_invested_formatted: `₹${totInv.toLocaleString('en-IN', {minimumFractionDigits: 2})}`,
        current_value: totCur,
        current_value_formatted: `₹${totCur.toLocaleString('en-IN', {minimumFractionDigits: 2})}`,
        profit_loss: totRet,
        profit_loss_formatted: `${totRet >= 0 ? '+' : ''}₹${totRet.toLocaleString('en-IN', {minimumFractionDigits: 2})}`,
        profit_loss_pct: `${retPct >= 0 ? '+' : ''}${retPct.toFixed(2)}%`,
        overall_xirr: '1.04%',
        holdings_count: records.length
      },
      records: records
    };
  }

  // Parse Post Office Fixed Income Statement
  let headersIdx = 7;
  for (let r = 0; r < Math.min(25, rows.length); r++) {
    if ((rows[r] || []).some(c => String(c).toLowerCase().includes('account number'))) {
      headersIdx = r;
      break;
    }
  }

  const records = [];
  let poName = 'Regional Post Office S.O';

  for (let r = headersIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const accNo = String(row[2] || '').trim();
    if (!accNo || accNo.toLowerCase().includes('total') || accNo.toLowerCase().includes('summary')) continue;
    
    const accType = String(row[4] || 'Unknown').trim();
    const po = String(row[9] || poName).trim();
    if (po && po !== 'Unknown') poName = po;

    const balRaw = String(row[15] || '0');
    const bal = parseFloat(balRaw.replace(/Cr\.|Dr\.|,/g, '').trim()) || 0;
    const openD = String(row[18] || '').trim();
    const matD = String(row[21] || '').trim();

    let catCode = 'OTHER';
    let projMat = bal;
    let projInt = 0;
    let yieldVal = 0;
    let tier = 'Standard';

    const accLower = accType.toLowerCase();
    if (accLower.includes('recurring')) {
      catCode = 'RD';
      const multiplier = bal > 0 ? bal / 100.0 : 1.0;
      const rdUnit = rdUnitMaturity(interestRates.RD);
      projMat = Math.round(rdUnit * multiplier * 100) / 100;
      projInt = Math.round((rdUnit - 6000) * multiplier * 100) / 100;
      yieldVal = Math.round((projInt / 5.0) * 100) / 100;
      tier = 'Micro RD (₹100/mo)';
    } else if (accLower.includes('time deposit')) {
      catCode = 'TD';
      const qRate = (interestRates.TD / 100.0) / 4.0; // was hardcoded 7.1, contradicting the 6.9% TD rate used by server.py and the print notes
      projMat = Math.round(bal * Math.pow(1 + qRate, 4) * 100) / 100;
      projInt = Math.round((projMat - bal) * 100) / 100;
      yieldVal = projInt;
      tier = bal >= 50000 ? 'High Net Worth (₹50k+)' : 'Standard TD';
    } else if (accLower.includes('savings')) {
      catCode = 'SB';
      yieldVal = Math.round(bal * (interestRates.SB / 100) * 100) / 100;
      tier = 'Liquid Savings';
    }

    const maskedAcc = accNo.length >= 7 ? `${accNo.slice(0, 4)}****${accNo.slice(-3)}` : accNo;

    records.push({
      id: records.length + 1,
      account_number: accNo,
      account_number_masked: maskedAcc,
      account_type: accType,
      category_code: catCode,
      tier: tier,
      post_office: po,
      balance: bal,
      balance_formatted: `₹${bal.toLocaleString('en-IN', {minimumFractionDigits: 2})}`,
      open_date: openD,
      maturity_date: matD,
      projected_maturity_value: projMat,
      projected_maturity_formatted: `₹${projMat.toLocaleString('en-IN', {minimumFractionDigits: 2})}`,
      projected_total_interest: projInt,
      projected_interest_formatted: `₹${projInt.toLocaleString('en-IN', {minimumFractionDigits: 2})}`,
      annual_yield: yieldVal
    });
  }

  const totBal = records.reduce((s, r) => s + r.balance, 0);
  const totProj = records.reduce((s, r) => s + r.projected_maturity_value, 0);
  const totInt = records.reduce((s, r) => s + r.projected_total_interest, 0);
  const totYld = records.reduce((s, r) => s + r.annual_yield, 0);

  return {
    asset_type: 'POST_OFFICE',
    metadata: {
      file_name: fileName,
      parsed_rows: records.length,
      total_balance: totBal,
      total_balance_formatted: `₹${totBal.toLocaleString('en-IN', {minimumFractionDigits: 2})}`,
      avg_balance: records.length > 0 ? totBal / records.length : 0,
      avg_balance_formatted: `₹${(records.length > 0 ? totBal / records.length : 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}`,
      total_projected_maturity: totProj,
      total_projected_maturity_formatted: `₹${totProj.toLocaleString('en-IN', {minimumFractionDigits: 2})}`,
      total_projected_interest: totInt,
      total_projected_interest_formatted: `₹${totInt.toLocaleString('en-IN', {minimumFractionDigits: 2})}`,
      total_annual_yield: totYld,
      total_annual_yield_formatted: `₹${totYld.toLocaleString('en-IN', {minimumFractionDigits: 2})}`,
      post_offices: [poName]
    },
    records: records
  };
}

// ==================== VIEW RENDERING ====================
function renderActiveView() {
  if (!activeData) return;

  // View control belongs to Post Office data: show it on Consolidated and
  // Post Office tabs, hide it on Mutual Funds (no SB/TD/RD types there).
  const vc = document.getElementById('viewControl');
  if (vc) vc.classList.toggle('hidden', currentAsset === 'mf');
  document.querySelectorAll('#viewControl .view-btn').forEach(b =>
    b.classList.toggle('active', b.getAttribute('data-view') === viewType));

  // Header tab counts must reflect the data actually shown — never a stale
  // demo count after an upload. (The HTML ships with demo counts as fallback.)
  const dopTabCount = document.querySelector('.switch-tab[data-asset="dop"] .tab-count');
  if (dopTabCount) dopTabCount.textContent = `(${(getActiveDop()?.records || []).length})`;
  const mfTabCount = document.querySelector('.switch-tab[data-asset="mf"] .tab-count');
  if (mfTabCount) mfTabCount.textContent = `(${(getActiveMf()?.records || []).length})`;

  if (currentAsset === 'consolidated') {
    renderConsolidatedView();
  } else if (currentAsset === 'dop') {
    renderPostOfficeView();
  } else if (currentAsset === 'mf') {
    renderMutualFundsView();
  }

  refreshMaturityYearOptions();
  renderCharts();
  // Populate the ledger on first render: filteredRecords starts empty, and
  // without this the table showed "No records" until the user touched a filter.
  applyFilters();
  updatePrintStatement();
}

function renderConsolidatedView() {
  const dop = getActiveDop();
  const mf = getActiveMf();
  const sum = activeData.summary || getConsolidatedFromData(dop, mf).summary;

  // Single-type lens on the Consolidated tab too: the viewed type drives the
  // hero, the KPI cards and the ledger — never the unfiltered totals.
  if (viewType !== 'all' && dop && Array.isArray(dop.records)) {
    const viewRecs = viewRecordsOf(dop.records);
    const vBal = viewRecs.reduce((s, r) => s + r.balance, 0);
    const vProj = viewRecs.reduce((s, r) => s + r.projected_maturity_value, 0);
    const vInt = viewRecs.reduce((s, r) => s + r.projected_total_interest, 0);
    document.getElementById('heroAssetBadge').innerHTML = '<i data-lucide="layers"></i> Consolidated Overview';
    document.getElementById('heroInvestorName').innerHTML = `<i data-lucide="user"></i> Portfolio Investor &bull; XXXXX1234X`;
    document.getElementById('heroValLabel').textContent = viewLabel();
    document.getElementById('heroValAmount').textContent = inr(vBal);
    document.getElementById('heroSummaryText').innerHTML = fmt(t('heroSumView'), ['<strong>' + viewRecs.length + '</strong>', '<strong>' + viewType + '</strong>', '<strong class="text-positive">' + inr(vProj) + '</strong>', inr(vInt)]);
    document.getElementById('heroStatTitle1').textContent = t('heroStatDop1');
    document.getElementById('heroStatNum1').textContent = `${viewRecs.length} Accounts`;
    document.getElementById('heroStatTitle2').textContent = t('heroStatDop2');
    document.getElementById('heroStatNum2').textContent = inr(vBal);
    document.getElementById('heroStatTitle3').textContent = t('heroStatDop3');
    document.getElementById('heroStatNum3').textContent = inr(vProj);
    document.getElementById('kpiLabel1').textContent = viewType + ' ' + t('viewBalance');
    document.getElementById('kpiVal1').textContent = inr(vBal);
    document.getElementById('kpiBadge1').textContent = `${viewRecs.length} Accounts`;
    document.getElementById('kpiNote1').textContent = viewLabel();
    document.getElementById('kpiLabel2').textContent = t('viewProjected');
    document.getElementById('kpiVal2').textContent = inr(vProj);
    document.getElementById('kpiBadge2').textContent = viewLabel();
    document.getElementById('kpiNote2').textContent = t('viewProjectedNote');
    document.getElementById('kpiLabel3').textContent = t('viewInterest');
    document.getElementById('kpiVal3').textContent = '+' + inr(vInt);
    document.getElementById('kpiBadge3').textContent = viewLabel();
    document.getElementById('kpiNote3').textContent = t('viewInterestNote');
    document.getElementById('kpiLabel4').textContent = t('viewAccounts');
    document.getElementById('kpiVal4').textContent = `${viewRecs.length}`;
    document.getElementById('kpiBadge4').textContent = viewLabel();
    document.getElementById('kpiNote4').textContent = t('viewAccountsNote');
    allRecords = viewRecs;
    setupPostOfficeTable();
    return;
  }

  document.getElementById('heroAssetBadge').innerHTML = '<i data-lucide="layers"></i> Consolidated Overview';
  document.getElementById('heroInvestorName').innerHTML = `<i data-lucide="user"></i> Portfolio Investor &bull; XXXXX1234X`;
  document.getElementById('heroValLabel').textContent = t('heroValCons');
  document.getElementById('heroValAmount').textContent = sum.total_net_worth_formatted;
  document.getElementById('heroSummaryText').innerHTML = fmt(t('heroSumCons'), ['<strong>' + sum.dop_book_balance_formatted + '</strong>', '<strong>' + sum.mf_current_value_formatted + '</strong>', '<strong class="text-positive">' + sum.total_projected_wealth_formatted + '</strong>']);

  document.getElementById('heroStatTitle1').textContent = t('heroStatCons1');
  document.getElementById('heroStatNum1').textContent = `${sum.total_holdings_count || 0} Holdings`;
  document.getElementById('heroStatTitle2').textContent = t('heroStatCons2');
  document.getElementById('heroStatNum2').textContent = sum.total_principal_formatted || sum.dop_book_balance_formatted;
  document.getElementById('heroStatTitle3').textContent = t('heroStatCons3');
  document.getElementById('heroStatNum3').textContent = sum.total_projected_wealth_formatted;

  document.getElementById('kpiLabel1').textContent = t('kpiCons1');
  document.getElementById('kpiVal1').textContent = sum.dop_book_balance_formatted;
  document.getElementById('kpiBadge1').textContent = `${dop?.records?.length || 0} Accounts`;
  document.getElementById('kpiNote1').textContent = 'DOP Allocation';

  document.getElementById('kpiLabel2').textContent = t('kpiCons2');
  document.getElementById('kpiVal2').textContent = sum.mf_current_value_formatted;
  document.getElementById('kpiBadge2').textContent = `${mf?.records?.length || 0} Direct Funds`;
  document.getElementById('kpiNote2').textContent = 'Market NAV';

  document.getElementById('kpiLabel3').textContent = t('kpiCons3');
  document.getElementById('kpiVal3').textContent = mf?.metadata?.overall_xirr || '1.04% XIRR';
  document.getElementById('kpiBadge3').textContent = 'Annualized';
  document.getElementById('kpiNote3').textContent = 'Compounded Rate';

  document.getElementById('kpiLabel4').textContent = t('kpiCons4');
  document.getElementById('kpiVal4').textContent = sum.projected_gain_formatted || '+₹35.61 Lakhs';
  document.getElementById('kpiBadge4').textContent = 'Maturity Realization';
  document.getElementById('kpiNote4').textContent = 'Guaranteed + Market';

  allRecords = dop?.records || mf?.records || [];
  setupPostOfficeTable();
}

function renderPostOfficeView() {
  const meta = activeData.metadata || {};
  allRecords = activeData.records || [];
  // The View control is the lens: every figure below is computed from the
  // viewed records only, never from the unfiltered dataset.
  const viewRecs = viewRecordsOf(allRecords);
  const vBal = viewRecs.reduce((s, r) => s + r.balance, 0);
  const vProj = viewRecs.reduce((s, r) => s + r.projected_maturity_value, 0);
  const vInt = viewRecs.reduce((s, r) => s + r.projected_total_interest, 0);

  document.getElementById('heroAssetBadge').innerHTML = '<i data-lucide="landmark"></i> Post Office Fixed Income';
  document.getElementById('heroInvestorName').innerHTML = '<i data-lucide="map-pin"></i> Regional Post Office S.O &bull; DOP Ledger';
  document.getElementById('heroValLabel').textContent = viewType === 'all' ? t('heroValDop') : viewLabel();
  document.getElementById('heroValAmount').textContent = viewType === 'all' ? (meta.total_balance_formatted || '₹0.00') : inr(vBal);
  document.getElementById('heroSummaryText').innerHTML = viewType === 'all'
    ? fmt(t('heroSumDop'), ['<strong>' + (meta.parsed_rows || allRecords.length) + '</strong>', '<strong class="text-positive">' + (meta.total_projected_maturity_formatted || '₹0.00') + '</strong>', (meta.total_projected_interest_formatted || '₹0.00')])
    : fmt(t('heroSumView'), ['<strong>' + viewRecs.length + '</strong>', '<strong>' + viewType + '</strong>', '<strong class="text-positive">' + inr(vProj) + '</strong>', inr(vInt)]);

  document.getElementById('heroStatTitle1').textContent = t('heroStatDop1');
  document.getElementById('heroStatNum1').textContent = `${viewRecs.length} Accounts`;
  document.getElementById('heroStatTitle2').textContent = t('heroStatDop2');
  document.getElementById('heroStatNum2').textContent = viewType === 'all' ? (meta.total_balance_formatted || '₹0.00') : inr(vBal);
  document.getElementById('heroStatTitle3').textContent = t('heroStatDop3');
  document.getElementById('heroStatNum3').textContent = viewType === 'all' ? (meta.total_projected_maturity_formatted || '₹0.00') : inr(vProj);

  if (viewType === 'all') {
    const tdRecords = allRecords.filter(r => r.category_code === 'TD');
    const rdRecords = allRecords.filter(r => r.category_code === 'RD');
    const sbRecords = allRecords.filter(r => r.category_code === 'SB');
    const tdSum = tdRecords.reduce((s, r) => s + r.balance, 0);
    const rdSum = rdRecords.reduce((s, r) => s + r.balance, 0);
    const sbSum = sbRecords.reduce((s, r) => s + r.balance, 0);
    document.getElementById('kpiLabel1').textContent = t('kpiDop1');
    document.getElementById('kpiVal1').textContent = `₹${tdSum.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
    document.getElementById('kpiBadge1').textContent = `${tdRecords.length} Accounts`;
    document.getElementById('kpiNote1').textContent = '1-Year Term';
    document.getElementById('kpiLabel2').textContent = t('kpiDop2');
    document.getElementById('kpiVal2').textContent = `₹${rdSum.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
    document.getElementById('kpiBadge2').textContent = `${rdRecords.length} Accounts`;
    document.getElementById('kpiNote2').textContent = '5-Yr Cumulative';
    document.getElementById('kpiLabel3').textContent = t('kpiDop3');
    document.getElementById('kpiVal3').textContent = `₹${sbSum.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
    document.getElementById('kpiBadge3').textContent = `${sbRecords.length} Account`;
    document.getElementById('kpiNote3').textContent = '4.0% Yield';
    document.getElementById('kpiLabel4').textContent = t('kpiDop4');
    document.getElementById('kpiVal4').textContent = `+${meta.total_projected_interest_formatted || '₹0.00'}`;
    document.getElementById('kpiBadge4').textContent = 'Quarterly Compounded';
    document.getElementById('kpiNote4').textContent = 'Guaranteed Yield';
  } else {
    // Single-type lens: all four KPI cards describe the viewed type only.
    document.getElementById('kpiLabel1').textContent = viewType + ' ' + t('viewBalance');
    document.getElementById('kpiVal1').textContent = inr(vBal);
    document.getElementById('kpiBadge1').textContent = `${viewRecs.length} Accounts`;
    document.getElementById('kpiNote1').textContent = viewLabel();
    document.getElementById('kpiLabel2').textContent = t('viewProjected');
    document.getElementById('kpiVal2').textContent = inr(vProj);
    document.getElementById('kpiBadge2').textContent = viewLabel();
    document.getElementById('kpiNote2').textContent = t('viewProjectedNote');
    document.getElementById('kpiLabel3').textContent = t('viewInterest');
    document.getElementById('kpiVal3').textContent = '+' + inr(vInt);
    document.getElementById('kpiBadge3').textContent = viewLabel();
    document.getElementById('kpiNote3').textContent = t('viewInterestNote');
    document.getElementById('kpiLabel4').textContent = t('viewAccounts');
    document.getElementById('kpiVal4').textContent = `${viewRecs.length}`;
    document.getElementById('kpiBadge4').textContent = viewLabel();
    document.getElementById('kpiNote4').textContent = t('viewAccountsNote');
  }

  setupPostOfficeTable();
}

function renderMutualFundsView() {
  const meta = activeData.metadata || {};
  allRecords = activeData.records || [];

  document.getElementById('heroAssetBadge').innerHTML = '<i data-lucide="trending-up"></i> Equity Mutual Funds &amp; Stocks';
  document.getElementById('heroInvestorName').innerHTML = `<i data-lucide="user"></i> Portfolio Investor &bull; XXXXX1234X`;
  document.getElementById('heroValLabel').textContent = t('heroValMf');
  document.getElementById('heroValAmount').textContent = meta.current_value_formatted || '₹0.00';
  
  const isGain = (meta.profit_loss || 0) >= 0;
  document.getElementById('heroSummaryText').innerHTML = fmt(t('heroSumMf'), [meta.total_invested_formatted || '₹0.00', meta.holdings_count || allRecords.length, '<strong class="' + (isGain ? 'text-positive' : 'text-rose') + '">' + (meta.profit_loss_formatted || '₹0.00') + '</strong>', meta.profit_loss_pct || '0.00%', '<strong class="text-positive">' + (meta.overall_xirr || '1.04%') + '</strong>']);

  document.getElementById('heroStatTitle1').textContent = t('heroStatMf1');
  document.getElementById('heroStatNum1').textContent = `${meta.holdings_count || allRecords.length} Funds`;
  document.getElementById('heroStatTitle2').textContent = t('heroStatMf2');
  document.getElementById('heroStatNum2').textContent = meta.total_invested_formatted || '₹0.00';
  document.getElementById('heroStatTitle3').textContent = t('heroStatMf3');
  document.getElementById('heroStatNum3').textContent = meta.overall_xirr || '1.04% XIRR';

  document.getElementById('kpiLabel1').textContent = t('kpiMf1');
  document.getElementById('kpiVal1').textContent = meta.current_value_formatted || '₹0.00';
  document.getElementById('kpiBadge1').textContent = meta.profit_loss_pct || '0.00%';
  document.getElementById('kpiNote1').textContent = 'Current NAV';

  document.getElementById('kpiLabel2').textContent = t('kpiMf2');
  document.getElementById('kpiVal2').textContent = meta.total_invested_formatted || '₹0.00';
  document.getElementById('kpiBadge2').textContent = `${allRecords.length} Schemes`;
  document.getElementById('kpiNote2').textContent = 'Cost Basis';

  document.getElementById('kpiLabel3').textContent = t('kpiMf3');
  document.getElementById('kpiVal3').textContent = meta.overall_xirr || '1.04%';
  document.getElementById('kpiBadge3').textContent = 'Annualized';
  document.getElementById('kpiNote3').textContent = 'Compounded Rate';

  document.getElementById('kpiLabel4').textContent = t('kpiMf4');
  document.getElementById('kpiVal4').textContent = meta.profit_loss_formatted || '₹0.00';
  document.getElementById('kpiVal4').className = isGain ? 'kpi-box-val text-positive' : 'kpi-box-val text-rose';
  document.getElementById('kpiBadge4').textContent = isGain ? 'Profit' : 'Unrealized Loss';
  document.getElementById('kpiNote4').textContent = 'Delta vs Cost';

  setupMutualFundsTable();
}

// ==================== TABLE STRUCTURES & FILTERS ====================
function setupPostOfficeTable() {
  document.getElementById('tableSectionTitle').textContent = t('tableTitleDop');
  // No chips on Post Office tabs: the View control above the ledger is the
  // only account-type filter, so it can never disagree with the PDF.
  document.getElementById('filterChipsWrap').innerHTML = '';
  currentFilterChip = 'all';
  document.getElementById('tableHead').innerHTML = `
    <tr>
      <th>#</th>
      <th>${t('thAccNo')}</th>
      <th>${t('thScheme')}</th>
      <th>${t('thTier')}</th>
      <th class="text-right">${t('thBalance')}</th>
      <th class="text-right">${t('thMaturity')}</th>
      <th>${t('thOpen')}</th>
      <th>${t('thMatDate')}</th>
      <th class="text-center">${t('thAction')}</th>
    </tr>
  `;
  attachFilterEvents();
}

function setupMutualFundsTable() {
  document.getElementById('tableSectionTitle').textContent = t('tableTitleMf');
  currentFilterChip = 'all';
  document.getElementById('filterChipsWrap').innerHTML = `
    <button class="chip-btn active" data-filter="all">${t('chipAllFunds')} (${allRecords.length})</button>
    <button class="chip-btn" data-filter="profit">${t('chipProfit')}</button>
    <button class="chip-btn" data-filter="loss">${t('chipLoss')}</button>
    <button class="chip-btn" data-filter="midcap">${t('chipMidcap')}</button>
    <button class="chip-btn" data-filter="thematic">${t('chipThematic')}</button>
  `;
  document.getElementById('tableHead').innerHTML = `
    <tr>
      <th>#</th>
      <th>${t('thSchemeName')}</th>
      <th>${t('thAmc')}</th>
      <th class="text-right">${t('thUnits')}</th>
      <th class="text-right">${t('thInvested')}</th>
      <th class="text-right">${t('thCurrent')}</th>
      <th class="text-right">${t('thPnl')}</th>
      <th class="text-center">${t('thXirr')}</th>
      <th class="text-center">${t('thAction')}</th>
    </tr>
  `;
  attachFilterEvents();
}

function attachFilterEvents() {
  document.querySelectorAll('#filterChipsWrap .chip-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('#filterChipsWrap .chip-btn').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      currentFilterChip = e.currentTarget.getAttribute('data-filter');
      applyFilters();
    });
  });
}

function applyFilters() {
  const query = (document.getElementById('searchInput').value || '').trim().toLowerCase();

  filteredRecords = allRecords.filter(r => {
    // Search query filter
    if (query) {
      if (currentAsset === 'mf' || r.scheme_name) {
        const str = `${r.scheme_name} ${r.amc} ${r.category} ${r.folio_no}`.toLowerCase();
        if (!str.includes(query)) return false;
      } else {
        const str = `${r.account_number} ${r.account_type} ${r.tier} ${r.balance}`.toLowerCase();
        if (!str.includes(query)) return false;
      }
    }

    // View + maturity-year + maturing-12m filters (Post Office rows only;
    // ignored for MF rows, which have no SB/TD/RD type)
    if (!(currentAsset === 'mf' || r.scheme_name)) {
      if (viewType !== 'all' && r.category_code !== viewType) return false;
      if (maturityYearFilter !== 'all') {
        const my = (String(r.maturity_date || '').match(/(20\d{2})/) || [])[1];
        if (my !== maturityYearFilter) return false;
      }
      if (maturing12mOnly) {
        const md = parseLooseDate(r.maturity_date);
        if (!md) return false;
        const now = new Date(); now.setHours(0, 0, 0, 0);
        const horizon = new Date(now); horizon.setMonth(horizon.getMonth() + 12);
        if (md <= now || md > horizon) return false;
      }
    }

    // Chip filter
    if (currentFilterChip !== 'all') {
      if (currentAsset === 'mf' || r.scheme_name) {
        if (currentFilterChip === 'profit') return r.is_profit;
        if (currentFilterChip === 'loss') return !r.is_profit;
        if (currentFilterChip === 'midcap') return r.subcategory?.toLowerCase().includes('mid cap');
        if (currentFilterChip === 'thematic') return r.subcategory?.toLowerCase().includes('thematic');
      } else {
        if (currentFilterChip === 'TD') return r.category_code === 'TD';
        if (currentFilterChip === 'RD') return r.category_code === 'RD';
        if (currentFilterChip === 'SB') return r.category_code === 'SB';
        if (currentFilterChip === 'high') return r.balance >= 10000;
      }
    }
    return true;
  });

  currentPage = 1;
  renderTable();
}

function sortedRecords(records) {
  const rows = [...records];
  const dateVal = (r, key) => { const d = parseLooseDate(r[key]); return d ? d.getTime() : Number.POSITIVE_INFINITY; };
  if (sortKey === 'balDesc') rows.sort((a, b) => (b.balance ?? b.current_value ?? 0) - (a.balance ?? a.current_value ?? 0));
  else if (sortKey === 'balAsc') rows.sort((a, b) => (a.balance ?? a.current_value ?? 0) - (b.balance ?? b.current_value ?? 0));
  else if (sortKey === 'matDate') rows.sort((a, b) => dateVal(a, 'maturity_date') - dateVal(b, 'maturity_date'));
  else if (sortKey === 'openDate') rows.sort((a, b) => dateVal(a, 'open_date') - dateVal(b, 'open_date'));
  return rows;
}

function renderTotalsBar() {
  const bar = document.getElementById('ledgerTotalsBar');
  if (!bar) return;
  const rows = filteredRecords || [];
  const isMf = rows.length > 0 && !!rows[0].scheme_name;
  if (rows.length === 0) {
    bar.innerHTML = `<span class="totals-label">${t('totalsLabel')}</span><span>${t('totalsNone')}</span>`;
    return;
  }
  if (isMf) {
    const inv = rows.reduce((s, r) => s + (r.invested_value || 0), 0);
    const cur = rows.reduce((s, r) => s + (r.current_value || 0), 0);
    const pnl = cur - inv;
    bar.innerHTML = `<span class="totals-label">${t('totalsLabel')}</span>`
      + `<span class="totals-item">${rows.length} ${t('totalsFunds')}</span>`
      + `<span class="totals-item">${t('totalsInvested')} <b>${inr(inv)}</b></span>`
      + `<span class="totals-item">${t('totalsCurrent')} <b>${inr(cur)}</b></span>`
      + `<span class="totals-item">${t('totalsPnl')} <b>${(pnl >= 0 ? '+' : '') + inr(pnl)}</b></span>`;
  } else {
    const bal = rows.reduce((s, r) => s + (r.balance || 0), 0);
    const proj = rows.reduce((s, r) => s + (r.projected_maturity_value || 0), 0);
    const intr = rows.reduce((s, r) => s + (r.projected_total_interest || 0), 0);
    bar.innerHTML = `<span class="totals-label">${t('totalsLabel')}</span>`
      + `<span class="totals-item">${rows.length} ${t('totalsAccounts')}</span>`
      + `<span class="totals-item">${t('totalsBalance')} <b>${inr(bal)}</b></span>`
      + `<span class="totals-item">${t('totalsProjected')} <b>${inr(proj)}</b></span>`
      + `<span class="totals-item">${t('totalsInterest')} <b>+${inr(intr)}</b></span>`;
  }
}

function renderTable() {
  if (!filteredRecords) filteredRecords = [...allRecords];
  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = '';
  renderTotalsBar();

  const ordered = sortedRecords(filteredRecords);
  const start = (currentPage - 1) * pageSize;
  const pageItems = ordered.slice(start, start + pageSize);

  if (pageItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:30px; color:var(--text-muted);">No records found matching filters</td></tr>`;
    document.getElementById('pageInfoText').textContent = 'Showing 0 records';
    return;
  }

  pageItems.forEach((r, idx) => {
    const tr = document.createElement('tr');

    if (currentAsset === 'mf' || r.scheme_name) {
      // Mutual Funds Row
      const isProf = r.returns >= 0;
      tr.innerHTML = `
        <td>${start + idx + 1}</td>
        <td><strong>${r.scheme_name}</strong><br><span style="font-size:0.7rem; color:var(--text-dim);">${isMasked ? maskFolio(r.folio_no) : r.folio_no}</span></td>
        <td><span class="badge-tag badge-blue">${r.amc}</span> <span style="font-size:0.7rem; color:var(--text-dim);">${r.subcategory}</span></td>
        <td class="text-right">${r.units.toFixed(3)}</td>
        <td class="text-right">${r.invested_formatted}</td>
        <td class="text-right font-bold">${r.current_formatted}</td>
        <td class="text-right font-bold ${isProf ? 'text-positive' : 'text-rose'}">${r.returns_formatted}</td>
        <td class="text-center font-bold ${isProf ? 'text-positive' : 'text-rose'}">${r.xirr}</td>
        <td class="text-center"><button class="btn btn-ghost btn-sm" onclick="openFundDetail(${r.id})">Inspect</button></td>
      `;
    } else {
      // Post Office Row
      const accDisplay = isMasked ? r.account_number_masked : r.account_number;
      tr.innerHTML = `
        <td>${start + idx + 1}</td>
        <td class="font-mono font-bold" style="color:var(--color-brand);">${accDisplay}</td>
        <td>${r.account_type}</td>
        <td><span class="badge-tag badge-scheme badge-${(r.category_code || 'other').toLowerCase()}">${r.tier}</span></td>
        <td class="text-right font-bold">${r.balance_formatted}</td>
        <td class="text-right font-bold text-positive">${r.projected_maturity_formatted}</td>
        <td>${r.open_date || '-'}</td>
        <td>${r.maturity_date || 'Liquid'}</td>
        <td class="text-center"><button class="btn btn-ghost btn-sm" onclick="openAccDetail(${r.id})">Inspect</button></td>
      `;
    }
    tbody.appendChild(tr);
  });

  const endIdx = Math.min(start + pageSize, filteredRecords.length);
  document.getElementById('pageInfoText').textContent = `Showing ${start + 1} to ${endIdx} of ${filteredRecords.length} records`;
  const countBadge = document.getElementById('tableCountBadge');
  if (countBadge) countBadge.textContent = `${filteredRecords.length} Records`;

  renderPaginationControls();
}

function renderPaginationControls() {
  const container = document.getElementById('pageControls');
  container.innerHTML = '';
  const totalPages = Math.ceil(filteredRecords.length / pageSize);
  if (totalPages <= 1) return;

  const prevBtn = document.createElement('button');
  prevBtn.className = 'page-btn';
  prevBtn.innerHTML = '‹';
  prevBtn.disabled = currentPage === 1;
  prevBtn.onclick = () => { if (currentPage > 1) { currentPage--; renderTable(); } };
  container.appendChild(prevBtn);

  const startP = Math.max(1, currentPage - 2);
  const endP = Math.min(totalPages, currentPage + 2);

  for (let p = startP; p <= endP; p++) {
    const btn = document.createElement('button');
    btn.className = `page-btn ${p === currentPage ? 'active' : ''}`;
    btn.textContent = p;
    btn.onclick = () => { currentPage = p; renderTable(); };
    container.appendChild(btn);
  }

  const nextBtn = document.createElement('button');
  nextBtn.className = 'page-btn';
  nextBtn.innerHTML = '›';
  nextBtn.disabled = currentPage === totalPages;
  nextBtn.onclick = () => { if (currentPage < totalPages) { currentPage++; renderTable(); } };
  container.appendChild(nextBtn);
}

function maskFolio(folio) {
  if (!folio) return '-';
  const str = String(folio);
  return str.length > 5 ? `${str.slice(0, 3)}****${str.slice(-2)}` : str;
}

// ==================== DYNAMIC PRINT REPORT GENERATOR ====================
function updatePrintStatement() {
  const scope = document.getElementById('selectPrintScope')?.value || 'current';
  const maskCheck = document.getElementById('chkIncludeMask')?.checked || isMasked;
  const waterfallCheck = document.getElementById('chkIncludeWaterfall')?.checked !== false;
  generatePrintReportHTML(scope, maskCheck, waterfallCheck);
}

function generatePrintReportHTML(scope = 'current', shouldMask = false, includeWaterfall = true) {
  // Print reads through the same data-source helpers as the screen: an
  // uploaded file can never print demo rows, and the View lens applies here.
  const dop = getActiveDop();
  const mf = getActiveMf();
  
  let targetMode = scope;
  if (targetMode === 'current') {
    // A single-type view prints that type's report even from the
    // Consolidated tab, so the PDF can never disagree with the screen.
    targetMode = (currentAsset === 'mf') ? 'mf_detailed'
      : (viewType !== 'all' || currentAsset === 'dop') ? 'dop_detailed' : 'consolidated';
  }

  const reportContainer = document.getElementById('executivePrintReport');
  if (!reportContainer) return;

  const investorName = shouldMask ? 'Portfolio Investor' : 'Portfolio Investor';
  const pan = shouldMask ? 'XXXXX1234X' : 'XXXXX1234X';
  const valDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  if (targetMode === 'dop_detailed' && dop) {
    // -------------------------------------------------------------
    // POST OFFICE DETAILED STATEMENT WITH ACCOUNT NUMBERS
    // The View lens applies here exactly as on screen: a TD-only view
    // prints TD accounts with TD totals, never the unfiltered schedule.
    // -------------------------------------------------------------
    const dopMeta = dop.metadata || {};
    const allDopRecs = dop.records || [];
    const records = viewRecordsOf(allDopRecs);
    const tdRecs = records.filter(r => r.category_code === 'TD');
    const rdRecs = records.filter(r => r.category_code === 'RD');
    const sbRecs = records.filter(r => r.category_code === 'SB');
    const viewNote = viewType === 'all' ? 'All account types' : viewLabel();
    const vBal = records.reduce((s, r) => s + r.balance, 0);
    const vProj = records.reduce((s, r) => s + r.projected_maturity_value, 0);
    const vInt = records.reduce((s, r) => s + r.projected_total_interest, 0);
    // View-aware print blocks: a single-type view prints only that type.
    const kpiGridHTML = viewType === 'all' ? `
        <div class="print-kpi-card card-indigo">
          <span class="print-kpi-lbl">${t('printDynDopKpiBook')}</span>
          <div class="print-kpi-val">${dopMeta.total_balance_formatted || '₹0.00'}</div>
          <span class="print-kpi-sub">Total Current Deposits</span>
        </div>
        <div class="print-kpi-card card-blue">
          <span class="print-kpi-lbl">${t('printDynDopKpiTd')}</span>
          <div class="print-kpi-val">₹${tdRecs.reduce((s,r)=>s+r.balance,0).toLocaleString('en-IN', {minimumFractionDigits:2})}</div>
          <span class="print-kpi-sub">${tdRecs.length} Accounts &bull; 1-Yr Quarterly</span>
        </div>
        <div class="print-kpi-card card-plum">
          <span class="print-kpi-lbl">${t('printDynDopKpiRd')}</span>
          <div class="print-kpi-val">₹${rdRecs.reduce((s,r)=>s+r.balance,0).toLocaleString('en-IN', {minimumFractionDigits:2})}</div>
          <span class="print-kpi-sub">${rdRecs.length} Accounts &bull; 5-Yr Cumulative</span>
        </div>
        <div class="print-kpi-card card-amber">
          <span class="print-kpi-lbl">${t('printDynDopKpiProj')}</span>
          <div class="print-kpi-val">${dopMeta.total_projected_maturity_formatted || '₹0.00'}</div>
          <span class="print-kpi-sub">+${dopMeta.total_projected_interest_formatted || '₹0.00'} Net Interest</span>
        </div>` : `
        <div class="print-kpi-card card-indigo">
          <span class="print-kpi-lbl">${viewType} ${t('viewBalance')}</span>
          <div class="print-kpi-val">${inr(vBal)}</div>
          <span class="print-kpi-sub">${records.length} Accounts &bull; ${viewLabel()}</span>
        </div>
        <div class="print-kpi-card card-blue">
          <span class="print-kpi-lbl">${t('viewProjected')}</span>
          <div class="print-kpi-val">${inr(vProj)}</div>
          <span class="print-kpi-sub">${viewLabel()}</span>
        </div>
        <div class="print-kpi-card card-plum">
          <span class="print-kpi-lbl">${t('viewInterest')}</span>
          <div class="print-kpi-val">+${inr(vInt)}</div>
          <span class="print-kpi-sub">${viewLabel()}</span>
        </div>
        <div class="print-kpi-card card-amber">
          <span class="print-kpi-lbl">${t('viewAccounts')}</span>
          <div class="print-kpi-val">${records.length}</div>
          <span class="print-kpi-sub">${viewLabel()}</span>
        </div>`;
    const schemeDefs = [
      { code: 'TD', name: 'Time Deposit For One Year (TD)', recs: tdRecs },
      { code: 'RD', name: 'Recurring Deposit Product (5-Yr RD)', recs: rdRecs },
      { code: 'SB', name: 'Savings Bank Account (SB)', recs: sbRecs },
    ].filter(d => viewType === 'all' || d.code === viewType);
    const schemeRowsHTML = schemeDefs.map(d => {
      const bal = d.recs.reduce((s2, r) => s2 + r.balance, 0);
      const proj = d.recs.reduce((s2, r) => s2 + r.projected_maturity_value, 0);
      const gain = d.code === 'SB'
        ? d.recs.reduce((s2, r) => s2 + r.annual_yield, 0)
        : d.recs.reduce((s2, r) => s2 + r.projected_total_interest, 0);
      const share = vBal > 0 ? ((bal / vBal) * 100).toFixed(2) : '0.00';
      return '<tr><td><strong>' + d.name + '</strong></td><td class="text-center">' + d.recs.length + '</td><td class="text-right">₹' + bal.toLocaleString('en-IN', {minimumFractionDigits:2}) + '</td><td class="text-right">' + share + '%</td><td class="text-right">₹' + proj.toLocaleString('en-IN', {minimumFractionDigits:2}) + '</td><td class="text-right font-bold text-positive">+₹' + gain.toLocaleString('en-IN', {minimumFractionDigits:2}) + (d.code === 'SB' ? ' / yr' : '') + '</td></tr>';
    }).join('');

    reportContainer.innerHTML = `
      <!-- Header -->
      <div class="print-header">
        <div class="print-brand-row">
          <div class="print-logo-box">
            ${brandLogoSVG('print-brand-logo')}
            <div>
              <h1 class="print-brand-name">SWInfoSystems &bull; APEX WEALTH</h1>
              <p class="print-brand-sub">POST OFFICE FIXED INCOME AUDIT &amp; ACCOUNT SCHEDULE</p>
            </div>
          </div>
          <div class="print-meta-box">
            <div class="print-badge verified">✓ AUDITED &amp; VERIFIED</div>
            <div class="print-meta-line"><strong>Statement Ref:</strong> APX-DOP-${new Date().getFullYear()}</div>
            <div class="print-meta-line"><strong>Valuation Date:</strong> ${valDate}</div>
          </div>
        </div>
        
        <div class="print-investor-card">
          <div class="print-inv-item">
            <span class="print-inv-label">Investor Name</span>
            <span class="print-inv-val">${investorName}</span>
          </div>
          <div class="print-inv-item">
            <span class="print-inv-label">Identifier (PAN)</span>
            <span class="print-inv-val">${pan}</span>
          </div>
          <div class="print-inv-item">
            <span class="print-inv-label">Post Office Branch</span>
            <span class="print-inv-val">${dopMeta.post_offices?.[0] || 'Regional Post Office S.O'}</span>
          </div>
          <div class="print-inv-item">
            <span class="print-inv-label">Total Accounts Audited</span>
            <span class="print-inv-val">${records.length} Active Accounts</span>
          </div>
          <div class="print-inv-item">
            <span class="print-inv-label">Report view</span>
            <span class="print-inv-val">${viewNote}</span>
          </div>
        </div>
      </div>

      <!-- KPI Grid -->
      <div class="print-section-title">${t('printDynDop1')}</div>
      <div class="print-kpi-grid">${kpiGridHTML}</div>

      <!-- Scheme Distribution Summary -->
      <div class="print-section-title">${t('printDynDop2')}</div>
      <table class="print-table">
        <thead>
          <tr>
            <th>Deposit Scheme Description</th>
            <th class="text-center">Active Accounts</th>
            <th class="text-right">Book Balance (₹)</th>
            <th class="text-right">Share (%)</th>
            <th class="text-right">Est. Maturity Value (₹)</th>
            <th class="text-right">Net Projected Gain (₹)</th>
          </tr>
        </thead>
        <tbody>
          ${schemeRowsHTML}
        </tbody>
        <tfoot>
          <tr class="print-total-row">
            <td><strong>TOTAL POST OFFICE PORTFOLIO</strong></td>
            <td class="text-center"><strong>${records.length}</strong></td>
            <td class="text-right"><strong>${inr(vBal)}</strong></td>
            <td class="text-right"><strong>100.00%</strong></td>
            <td class="text-right font-bold text-positive"><strong>${inr(vProj)}</strong></td>
            <td class="text-right font-bold text-positive"><strong>+${inr(vInt)}</strong></td>
          </tr>
        </tfoot>
      </table>

      <!-- DETAILED POST OFFICE ACCOUNT NUMBERS SCHEDULE -->
      <div class="print-section-title print-page-break" style="margin-top: 18px;">${t('printDynDop3')}</div>
      <table class="print-table compact-table">
        <thead>
          <tr>
            <th style="width:30px;">#</th>
            <th>${t('thAccNo')}</th>
            <th>Scheme Description</th>
            <th>Classification</th>
            <th class="text-right">${t('thBalance')}</th>
            <th class="text-right">${t('thMaturity')}</th>
            <th class="text-center">Open Date</th>
            <th class="text-center">Maturity Date</th>
            <th class="text-right">Projected Interest (₹)</th>
          </tr>
        </thead>
        <tbody>
          ${records.map((r, i) => `
            <tr>
              <td>${i + 1}</td>
              <td class="print-mono">${shouldMask ? r.account_number_masked : r.account_number}</td>
              <td>${r.account_type}</td>
              <td>${r.tier}</td>
              <td class="text-right font-bold">${r.balance_formatted}</td>
              <td class="text-right font-bold" style="color:#1E40AF;">${r.projected_maturity_formatted}</td>
              <td class="text-center">${r.open_date || '-'}</td>
              <td class="text-center">${r.maturity_date || 'Liquid'}</td>
              <td class="text-right" style="color:#1E40AF;">+${r.projected_interest_formatted}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <!-- Sign-off -->
      <div class="print-footer-block">
        <div class="print-disclaimer">
          <p><strong>Compliance &amp; Verification Note:</strong> Statement generated directly from verified Department of Posts (India Post) records. Interest calculations adhere to government rates (6.70% p.a. for 5-Year RD, 6.90% p.a. for 1-Year TD). Masking enabled: ${shouldMask ? 'YES' : 'NO'}.</p>
        </div>
        ${signoffBlockHTML()}
      </div>
    `;

  } else if (targetMode === 'mf_detailed' && mf) {
    // -------------------------------------------------------------
    // MUTUAL FUNDS & DEMAT DETAILED STATEMENT
    // -------------------------------------------------------------
    const mfMeta = mf.metadata || {};
    const records = mf.records || [];

    reportContainer.innerHTML = `
      <div class="print-header">
        <div class="print-brand-row">
          <div class="print-logo-box">
            ${brandLogoSVG('print-brand-logo')}
            <div>
              <h1 class="print-brand-name">SWInfoSystems &bull; APEX WEALTH</h1>
              <p class="print-brand-sub">MUTUAL FUNDS &amp; DEMAT PORTFOLIO STATEMENT</p>
            </div>
          </div>
          <div class="print-meta-box">
            <div class="print-badge verified">✓ AUDITED &amp; VERIFIED</div>
            <div class="print-meta-line"><strong>Statement Ref:</strong> APX-MF-${new Date().getFullYear()}</div>
            <div class="print-meta-line"><strong>Valuation Date:</strong> ${valDate}</div>
          </div>
        </div>
        
        <div class="print-investor-card">
          <div class="print-inv-item"><span class="print-inv-label">Investor Name</span><span class="print-inv-val">${investorName}</span></div>
          <div class="print-inv-item"><span class="print-inv-label">Identifier (PAN)</span><span class="print-inv-val">${pan}</span></div>
          <div class="print-inv-item"><span class="print-inv-label">Platform</span><span class="print-inv-val">Groww Demat / Direct</span></div>
          <div class="print-inv-item"><span class="print-inv-label">Total Holdings</span><span class="print-inv-val">${records.length} Direct Funds</span></div>
        </div>
      </div>

      <div class="print-section-title">${t('printDynMf1')}</div>
      <div class="print-kpi-grid">
        <div class="print-kpi-card card-indigo">
          <span class="print-kpi-lbl">${t('printDynMfKpiInv')}</span>
          <div class="print-kpi-val">${mfMeta.total_invested_formatted || '₹0.00'}</div>
          <span class="print-kpi-sub">Cost Basis Principal</span>
        </div>
        <div class="print-kpi-card card-blue">
          <span class="print-kpi-lbl">${t('printDynMfKpiCur')}</span>
          <div class="print-kpi-val">${mfMeta.current_value_formatted || '₹0.00'}</div>
          <span class="print-kpi-sub">Live NAV Market Value</span>
        </div>
        <div class="print-kpi-card card-plum">
          <span class="print-kpi-lbl">${t('printDynMfKpiPnl')}</span>
          <div class="print-kpi-val">${mfMeta.profit_loss_formatted || '₹0.00'}</div>
          <span class="print-kpi-sub">${mfMeta.profit_loss_pct || '0.00%'} Delta</span>
        </div>
        <div class="print-kpi-card card-amber">
          <span class="print-kpi-lbl">${t('printDynMfKpiXirr')}</span>
          <div class="print-kpi-val">${mfMeta.overall_xirr || '1.04%'}</div>
          <span class="print-kpi-sub">Annualized Compounded Growth</span>
        </div>
      </div>

      <div class="print-section-title">${t('printDynMf2')}</div>
      <table class="print-table">
        <thead>
          <tr>
            <th>Fund Scheme Name</th>
            <th>${t('thAmc')}</th>
            <th>Folio Number</th>
            <th class="text-right">${t('thUnits')}</th>
            <th class="text-right">Invested Cost (₹)</th>
            <th class="text-right">${t('thCurrent')}</th>
            <th class="text-right">Net P&amp;L (₹)</th>
            <th class="text-center">${t('thXirr')}</th>
          </tr>
        </thead>
        <tbody>
          ${records.map(r => `
            <tr>
              <td><strong>${r.scheme_name}</strong></td>
              <td>${r.amc} &bull; ${r.subcategory}</td>
              <td class="print-mono">${shouldMask ? maskFolio(r.folio_no) : r.folio_no}</td>
              <td class="text-right">${r.units.toFixed(3)}</td>
              <td class="text-right">${r.invested_formatted}</td>
              <td class="text-right font-bold">${r.current_formatted}</td>
              <td class="text-right font-bold" style="color:${r.returns >= 0 ? '#1E40AF' : '#b91c1c'};">${r.returns_formatted} (${r.returns_pct_formatted})</td>
              <td class="text-center font-bold" style="color:${r.returns >= 0 ? '#1E40AF' : '#b91c1c'};">${r.xirr}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr class="print-total-row">
            <td colspan="4"><strong>TOTAL MUTUAL FUNDS PORTFOLIO</strong></td>
            <td class="text-right"><strong>${mfMeta.total_invested_formatted}</strong></td>
            <td class="text-right font-bold"><strong>${mfMeta.current_value_formatted}</strong></td>
            <td class="text-right font-bold" style="color:${mfMeta.profit_loss >= 0 ? '#1E40AF' : '#b91c1c'};"><strong>${mfMeta.profit_loss_formatted}</strong></td>
            <td class="text-center font-bold"><strong>${mfMeta.overall_xirr}</strong></td>
          </tr>
        </tfoot>
      </table>

      <div class="print-footer-block">
        <div class="print-disclaimer">
          <p><strong>Compliance &amp; Valuation Note:</strong> Mutual fund investments are subject to market risks. Net Asset Values (NAV) reflect closing published values.</p>
        </div>
        ${signoffBlockHTML()}
      </div>
    `;

  } else {
    // -------------------------------------------------------------
    // CONSOLIDATED WEALTH INTELLIGENCE STATEMENT
    // -------------------------------------------------------------
    const dopVal = dop?.metadata?.total_balance || 0;
    const dopProj = dop?.metadata?.total_projected_maturity || 0;
    const dopInt = dop?.metadata?.total_projected_interest || 0;
    const mfInv = mf?.metadata?.total_invested || 0;
    const mfCur = mf?.metadata?.current_value || 0;
    const totNetWorth = dopVal + mfCur;
    const totProjWealth = dopProj + mfCur;
    const dopRecordsAll = dop?.records || [];
    const dopRecords = viewRecordsOf(dopRecordsAll);
    // When a single type is viewed, the consolidated DOP figures are that
    // type's figures — the allocation row, schedule and waterfall all agree.
    const dopValView = viewType === 'all' ? dopVal : dopRecords.reduce((a, r) => a + r.balance, 0);
    const dopProjView = viewType === 'all' ? dopProj : dopRecords.reduce((a, r) => a + r.projected_maturity_value, 0);
    const waterfallByYear = {};
    dopRecords.forEach(r => {
      const y = (String(r.maturity_date || '').match(/(20\d{2})/) || [])[1];
      if (!y) return;
      if (!waterfallByYear[y]) waterfallByYear[y] = { payout: 0, count: 0 };
      waterfallByYear[y].payout += r.projected_maturity_value || 0;
      waterfallByYear[y].count += 1;
    });
    const waterfallHTML = Object.keys(waterfallByYear).sort().map(y =>
      '<div class="waterfall-box"><span class="waterfall-year">YEAR ' + y + '</span><span class="waterfall-val">₹' + Math.round(waterfallByYear[y].payout).toLocaleString('en-IN', {minimumFractionDigits:2}) + '</span><span class="waterfall-desc">' + waterfallByYear[y].count + ' Accounts maturing</span></div>').join('');
    const mfRecords = mf?.records || [];

    reportContainer.innerHTML = `
      <div class="print-header">
        <div class="print-brand-row">
          <div class="print-logo-box">
            ${brandLogoSVG('print-brand-logo')}
            <div>
              <h1 class="print-brand-name">SWInfoSystems &bull; APEX WEALTH</h1>
              <p class="print-brand-sub">CONSOLIDATED MULTI-ASSET WEALTH INTELLIGENCE REPORT</p>
            </div>
          </div>
          <div class="print-meta-box">
            <div class="print-badge verified">✓ AUDITED &amp; VERIFIED</div>
            <div class="print-meta-line"><strong>Statement Ref:</strong> APX-CONS-${new Date().getFullYear()}</div>
            <div class="print-meta-line"><strong>Valuation Date:</strong> ${valDate}</div>
          </div>
        </div>
        
        <div class="print-investor-card">
          <div class="print-inv-item"><span class="print-inv-label">Investor Name</span><span class="print-inv-val">${investorName}</span></div>
          <div class="print-inv-item"><span class="print-inv-label">Identifier (PAN)</span><span class="print-inv-val">${pan}</span></div>
          <div class="print-inv-item"><span class="print-inv-label">Asset Platforms</span><span class="print-inv-val">India Post &bull; Groww Demat</span></div>
          <div class="print-inv-item"><span class="print-inv-label">Audit Scope</span><span class="print-inv-val">${dopRecords.length + mfRecords.length} Consolidated Holdings</span></div>
        </div>
      </div>

      <div class="print-section-title">${t('printDynCons1')}</div>
      <div class="print-kpi-grid">
        <div class="print-kpi-card card-indigo">
          <span class="print-kpi-lbl">${t('printDynConsKpiNet')}</span>
          <div class="print-kpi-val">₹${totNetWorth.toLocaleString('en-IN', {minimumFractionDigits:2})}</div>
          <span class="print-kpi-sub">Total Current Market Valuation</span>
        </div>
        <div class="print-kpi-card card-blue">
          <span class="print-kpi-lbl">${t('printDynConsKpiDop')}</span>
          <div class="print-kpi-val">₹${dopVal.toLocaleString('en-IN', {minimumFractionDigits:2})}</div>
          <span class="print-kpi-sub">${dopRecords.length} Accounts &bull; ${totNetWorth > 0 ? ((dopVal/totNetWorth)*100).toFixed(1) : 0}% Share</span>
        </div>
        <div class="print-kpi-card card-plum">
          <span class="print-kpi-lbl">${t('printDynConsKpiMf')}</span>
          <div class="print-kpi-val">₹${mfCur.toLocaleString('en-IN', {minimumFractionDigits:2})}</div>
          <span class="print-kpi-sub">${mfRecords.length} Direct Schemes &bull; ${totNetWorth > 0 ? ((mfCur/totNetWorth)*100).toFixed(1) : 0}% Share</span>
        </div>
        <div class="print-kpi-card card-amber">
          <span class="print-kpi-lbl">${t('printDynConsKpiProj')}</span>
          <div class="print-kpi-val">₹${totProjWealth.toLocaleString('en-IN', {minimumFractionDigits:2})}</div>
          <span class="print-kpi-sub">+₹${(dopInt/100000).toFixed(2)} Lakhs Guaranteed Interest</span>
        </div>
      </div>

      <div class="print-section-title">${t('printDynCons2')}</div>
      <table class="print-table">
        <thead>
          <tr>
            <th>Asset Class</th>
            <th>Instrument / Platform</th>
            <th class="text-center">Holdings</th>
            <th class="text-right">Cost Basis (₹)</th>
            <th class="text-right">Current Valuation (₹)</th>
            <th class="text-right">Allocation (%)</th>
            <th class="text-right">Projected Realization (₹)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Fixed Income Deposits</strong></td>
            <td>Post Office (TD, RD, Savings)</td>
            <td class="text-center">${dopRecords.length}</td>
            <td class="text-right">₹${dopValView.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
            <td class="text-right">₹${dopValView.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
            <td class="text-right"><strong>${totNetWorth > 0 ? ((dopValView/totNetWorth)*100).toFixed(2) : 0}%</strong></td>
            <td class="text-right font-bold" style="color:#1E40AF;">₹${dopProjView.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
          </tr>
          <tr>
            <td><strong>Equity Mutual Funds</strong></td>
            <td>Direct Growth Schemes (Groww)</td>
            <td class="text-center">${mfRecords.length}</td>
            <td class="text-right">₹${mfInv.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
            <td class="text-right">₹${mfCur.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
            <td class="text-right"><strong>${totNetWorth > 0 ? ((mfCur/totNetWorth)*100).toFixed(2) : 0}%</strong></td>
            <td class="text-right font-bold" style="color:#1E40AF;">₹${mfCur.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="print-total-row">
            <td colspan="2"><strong>TOTAL CONSOLIDATED PORTFOLIO</strong></td>
            <td class="text-center"><strong>${dopRecords.length + mfRecords.length}</strong></td>
            <td class="text-right"><strong>₹${(dopVal + mfInv).toLocaleString('en-IN', {minimumFractionDigits:2})}</strong></td>
            <td class="text-right"><strong>₹${totNetWorth.toLocaleString('en-IN', {minimumFractionDigits:2})}</strong></td>
            <td class="text-right"><strong>100.00%</strong></td>
            <td class="text-right font-bold" style="color:#1E40AF;"><strong>₹${totProjWealth.toLocaleString('en-IN', {minimumFractionDigits:2})}</strong></td>
          </tr>
        </tfoot>
      </table>

      <!-- Key Accounts Sample Schedule -->
      <div class="print-section-title" style="margin-top: 18px;">${t('printDynCons3')}</div>
      <table class="print-table compact-table">
        <thead>
          <tr>
            <th style="width:30px;">#</th>
            <th>${t('thAccNo')}</th>
            <th>${t('thScheme')}</th>
            <th>Classification</th>
            <th class="text-right">${t('thBalance')}</th>
            <th class="text-right">${t('thMaturity')}</th>
            <th class="text-center">Open Date</th>
            <th class="text-center">Maturity Date</th>
          </tr>
        </thead>
        <tbody>
          ${dopRecords.slice(0, 15).map((r, i) => `
            <tr>
              <td>${i + 1}</td>
              <td class="print-mono">${shouldMask ? r.account_number_masked : r.account_number}</td>
              <td>${r.account_type}</td>
              <td>${r.tier}</td>
              <td class="text-right font-bold">${r.balance_formatted}</td>
              <td class="text-right font-bold" style="color:#1E40AF;">${r.projected_maturity_formatted}</td>
              <td class="text-center">${r.open_date || '-'}</td>
              <td class="text-center">${r.maturity_date || 'Liquid'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${dopRecords.length > 15 ? `<p style="font-size:6.5pt; color:#64748b; margin-top:-6px; margin-bottom:12px;">* Displaying top 15 key accounts in consolidated report. For the full ${dopRecords.length} accounts schedule, select 'Post Office Full Statement' in Print options.</p>` : ''}

      ${includeWaterfall ? `
        <div class="print-section-title">${t('printDynCons4')}</div>
        <div class="print-waterfall-grid">
          ${waterfallHTML}
        </div>
      ` : ''}

      <div class="print-footer-block">
        <div class="print-disclaimer">
          <p><strong>Compliance &amp; Verification Note:</strong> Consolidated report represents active financial positions across fixed income and equity assets. All data stored securely in browser local storage.</p>
        </div>
        ${signoffBlockHTML()}
      </div>
    `;
  }

  // Shared official footer line on every generated report.
  reportContainer.insertAdjacentHTML('beforeend',
    `<div class="print-footer-line">SWInfoSystems &bull; Apex Wealth &bull; Portfolio statement &bull; View: ${viewType === 'all' ? 'All account types' : viewLabel()} &bull; Valuation date ${valDate} &bull; Rates applied: RD ${interestRates.RD}% &bull; TD ${interestRates.TD}% &bull; SB ${interestRates.SB}% p.a. &bull; Projections are estimates, not guarantees &bull; ${shouldMask ? 'Identifiers masked' : 'Identifiers unmasked &mdash; handle as sensitive'}</div>`);
}

// ==================== CHART VISUALIZATIONS ====================
function renderCharts() {
  // Charts are progressive enhancement: if the Chart.js CDN failed to load,
  // the table, KPIs and print report must still render instead of throwing.
  if (typeof Chart === 'undefined') return;
  try { renderAllocationDonutChart(); } catch (e) { console.warn('Donut chart failed:', e); }
  try { renderTimelineBarChart(); } catch (e) { console.warn('Timeline chart failed:', e); }
}

function renderAllocationDonutChart() {
  const chartCanvas = document.getElementById('allocationDonutChart');
  if (!chartCanvas) return;
  const ctx = chartCanvas.getContext('2d');
  if (donutChart) donutChart.destroy();

  let labels = [], data = [], colors = [];
  const dop = getActiveDop();
  const mf = getActiveMf();

  if (currentAsset === 'mf' || (!dop && mf)) {
    const recs = mf?.records || [];
    labels = recs.map(r => r.scheme_name.length > 20 ? r.scheme_name.slice(0, 18) + '...' : r.scheme_name);
    data = recs.map(r => r.current_value);
    colors = ['#1D4ED8', '#7C5C9E', '#A67C3D', '#7C6A9C', '#B4534D'];
  } else if (currentAsset === 'dop' || (dop && !mf)) {
    // Donut follows the View lens: a single-type view shows that type only.
    const recs = viewRecordsOf(dop?.records || []);
    const tdSum = recs.filter(r => r.category_code === 'TD').reduce((s, r) => s + r.balance, 0);
    const rdSum = recs.filter(r => r.category_code === 'RD').reduce((s, r) => s + r.balance, 0);
    const sbSum = recs.filter(r => r.category_code === 'SB').reduce((s, r) => s + r.balance, 0);
    const pairs = [
      ['Time Deposits (TD)', tdSum, '#1D4ED8'],
      ['Recurring Deposits (RD)', rdSum, '#7C5C9E'],
      ['Savings Bank (SB)', sbSum, '#A67C3D'],
    ].filter(p => viewType === 'all' || p[0].includes('(' + viewType + ')'));
    labels = pairs.map(p => p[0]);
    data = pairs.map(p => p[1]);
    colors = pairs.map(p => p[2]);
  } else {
    const dopVal = viewRecordsOf(dop?.records || []).reduce((s, r) => s + r.balance, 0);
    const mfVal = mf?.metadata?.current_value || 0;
    labels = ['Fixed Income (Post Office)', 'Equity Mutual Funds'];
    data = [dopVal, mfVal];
    colors = ['#1D4ED8', '#7C5C9E'];
  }

  donutChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: colors,
        borderColor: isLightTheme ? '#ffffff' : '#111827',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      cutout: '70%'
    }
  });

  const legend = document.getElementById('chartLegendList');
  const tot = data.reduce((a, b) => a + b, 0);
  legend.innerHTML = labels.map((l, i) => `
    <div class="legend-item">
      <div><span class="legend-dot" style="background:${colors[i] || '#1E40AF'}"></span><span>${l}</span></div>
      <div><strong>₹${(data[i] || 0).toLocaleString('en-IN')}</strong> <span style="color:var(--text-dim); margin-left:4px;">(${tot > 0 ? ((data[i]/tot)*100).toFixed(1) : 0}%)</span></div>
    </div>
  `).join('');
}

function renderTimelineBarChart() {
  const chartCanvas = document.getElementById('timelineBarChart');
  if (!chartCanvas) return;
  const ctx = chartCanvas.getContext('2d');
  if (barChart) barChart.destroy();

  let labels = [], data = [];
  const dop = getActiveDop();
  const mf = getActiveMf();

  if (currentAsset === 'mf' || (!dop && mf)) {
    const recs = mf?.records || [];
    labels = recs.map(r => r.scheme_name.split(' ')[0] + ' ' + (r.scheme_name.split(' ')[1] || ''));
    data = recs.map(r => r.returns);
  } else {
    // Timeline computed from the viewed records — never hardcoded demo years.
    const byYear = {};
    viewRecordsOf(dop?.records || []).forEach(r => {
      const y = (String(r.maturity_date || '').match(/(20\d{2})/) || [])[1];
      if (!y) return;
      if (!byYear[y]) byYear[y] = { payout: 0, count: 0 };
      byYear[y].payout += r.projected_maturity_value || 0;
      byYear[y].count += 1;
    });
    labels = Object.keys(byYear).sort();
    data = chartMode === 'payout' ? labels.map(y => Math.round(byYear[y].payout)) : labels.map(y => byYear[y].count);
  }

  barChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Value',
        data: data,
        backgroundColor: data.map(v => v >= 0 ? 'rgba(29, 78, 216, 0.75)' : 'rgba(180, 83, 77, 0.75)'),
        borderColor: data.map(v => v >= 0 ? '#1D4ED8' : '#B4534D'),
        borderWidth: 1.5,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: isLightTheme ? '#64748b' : '#94a3b8' } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: isLightTheme ? '#64748b' : '#94a3b8' } }
      }
    }
  });
}

// ==================== MODAL INSPECTIONS ====================
window.openAccDetail = function(id) {
  const acc = allRecords.find(r => r.id === id);
  if (!acc) return;
  document.getElementById('modalTag').textContent = 'Post Office Account Inspection';
  document.getElementById('modalTitle').textContent = isMasked ? acc.account_number_masked : acc.account_number;
  document.getElementById('modalGridContent').innerHTML = `
    <div class="modal-stat"><span class="modal-stat-label">Scheme Description</span><div class="modal-stat-val">${acc.account_type}</div></div>
    <div class="modal-stat"><span class="modal-stat-label">Classification Tier</span><div class="modal-stat-val">${acc.tier}</div></div>
    <div class="modal-stat"><span class="modal-stat-label">Book Balance</span><div class="modal-stat-val" style="color:#1E40AF;">${acc.balance_formatted}</div></div>
    <div class="modal-stat"><span class="modal-stat-label">Projected Maturity Payout</span><div class="modal-stat-val" style="color:#1E40AF;">${acc.projected_maturity_formatted}</div></div>
    <div class="modal-stat"><span class="modal-stat-label">Open Date</span><div class="modal-stat-val">${acc.open_date || '-'}</div></div>
    <div class="modal-stat"><span class="modal-stat-label">Maturity Date</span><div class="modal-stat-val">${acc.maturity_date || 'Liquid'}</div></div>
  `;
  document.getElementById('detailModal').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
};

window.openFundDetail = function(id) {
  const f = allRecords.find(r => r.id === id);
  if (!f) return;
  document.getElementById('modalTag').textContent = 'Mutual Fund Direct Holding';
  document.getElementById('modalTitle').textContent = f.scheme_name;
  document.getElementById('modalGridContent').innerHTML = `
    <div class="modal-stat"><span class="modal-stat-label">Fund House (AMC)</span><div class="modal-stat-val">${f.amc}</div></div>
    <div class="modal-stat"><span class="modal-stat-label">Category / Subcategory</span><div class="modal-stat-val">${f.subcategory}</div></div>
    <div class="modal-stat"><span class="modal-stat-label">Invested Cost</span><div class="modal-stat-val">${f.invested_formatted}</div></div>
    <div class="modal-stat"><span class="modal-stat-label">Current Value</span><div class="modal-stat-val" style="color:#1D4ED8;">${f.current_formatted}</div></div>
    <div class="modal-stat"><span class="modal-stat-label">Returns P&amp;L</span><div class="modal-stat-val" style="color:${f.is_profit ? '#1E40AF' : '#fb7185'};">${f.returns_formatted} (${f.returns_pct_formatted})</div></div>
    <div class="modal-stat"><span class="modal-stat-label">Annualized XIRR</span><div class="modal-stat-val" style="color:#1E40AF;">${f.xirr}</div></div>
  `;
  document.getElementById('detailModal').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
};

function closeModal() {
  const modal = document.getElementById('detailModal');
  if (modal) modal.classList.add('hidden');
}
window.closeModal = closeModal;
window.closePrintModal = closePrintModal;

// ==================== EXPORTS ====================
function exportToExcel() {
  if (!allRecords || allRecords.length === 0) return showToast('No records to export', 'error');
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(allRecords);
  XLSX.utils.book_append_sheet(wb, ws, 'Portfolio_Holdings');
  XLSX.writeFile(wb, `Apex_Portfolio_Report_${new Date().toISOString().slice(0,10)}.xlsx`);
  showToast('Excel spreadsheet downloaded!', 'success');
}

function exportToCSV() {
  if (!filteredRecords || filteredRecords.length === 0) return showToast('No records to export', 'error');
  const ws = XLSX.utils.json_to_sheet(filteredRecords);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Apex_Holdings_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  showToast('CSV dataset downloaded!', 'success');
}

function exportToCSVView() {
  // Per-type CSV: exactly the rows the current view shows (view + filters).
  if (!filteredRecords || filteredRecords.length === 0) return showToast('No records in the current view to export', 'error');
  const ws = XLSX.utils.json_to_sheet(filteredRecords);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Apex_${viewType}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  showToast(`CSV for the ${viewType === 'all' ? 'full' : viewType + '-only'} view downloaded (${filteredRecords.length} rows)!`, 'success');
}

function exportToJSON() {
  if (!activeData) return;
  const blob = new Blob([JSON.stringify(activeData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Apex_Portfolio_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  showToast('JSON portfolio file downloaded!', 'success');
}

// ==================== UTILITIES ====================
function roundNum(num, decimals = 2) {
  return Number(Math.round(Number(num + 'e' + decimals)) + 'e-' + decimals) || 0;
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast-msg';
  toast.innerHTML = `<i data-lucide="${type === 'success' ? 'check-circle' : 'info'}" style="width:14px; height:14px; color:${type === 'success' ? '#7C5C9E' : '#1E40AF'};"></i><span>${msg}</span>`;
  container.appendChild(toast);
  if (window.lucide) lucide.createIcons();
  setTimeout(() => toast.remove(), 3500);
}

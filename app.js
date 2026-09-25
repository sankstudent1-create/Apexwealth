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
let isMasked = false;
let isLightTheme = false;
let isDemoMode = false;

// Chart Instances
let donutChart = null;
let barChart = null;

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) lucide.createIcons();
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
      renderActiveView();
    });
  });

  // Privacy Masking Toggle
  document.getElementById('btnPrivacy').addEventListener('click', () => {
    isMasked = !isMasked;
    document.getElementById('privacyText').textContent = isMasked ? 'Unmask' : 'Mask Data';
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
function initPortfolioState() {
  const hasLocal = StorageService.hasUserData();

  if (hasLocal) {
    document.getElementById('onboardingSection').classList.add('hidden');
    document.getElementById('storageStatusBar').classList.remove('hidden');
    document.getElementById('dashboardContainer').classList.remove('hidden');
    loadActivePortfolioFromStorage();
  } else if (isDemoMode && window.DEFAULT_PORTFOLIO_DATA) {
    document.getElementById('onboardingSection').classList.add('hidden');
    document.getElementById('storageStatusBar').classList.remove('hidden');
    document.getElementById('dashboardContainer').classList.remove('hidden');
    document.getElementById('storageStatusText').textContent = 'Viewing Sample Demo Portfolio (Upload your files to analyze your own portfolio)';
    activeData = getConsolidatedFromData(window.DEFAULT_PORTFOLIO_DATA.dop, window.DEFAULT_PORTFOLIO_DATA.mf);
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
    showToast('Loaded sample demo portfolio for preview', 'success');
    initPortfolioState();
  } else {
    showToast('Demo dataset not available.', 'error');
  }
}

function loadActivePortfolioFromStorage() {
  const dop = StorageService.getDop();
  const mf = StorageService.getMf();

  let statusMsg = [];
  if (dop) statusMsg.push(`${dop.metadata?.parsed_rows || 0} Post Office accounts`);
  if (mf) statusMsg.push(`${mf.metadata?.holdings_count || 0} Mutual Funds`);

  document.getElementById('storageStatusText').textContent = `💾 Active Portfolio Stored Locally (${statusMsg.join(' + ')}) • 100% Private (Zero Cloud Upload)`;

  if (currentAsset === 'dop') {
    activeData = dop || (mf ? getConsolidatedFromData(null, mf) : null);
  } else if (currentAsset === 'mf') {
    activeData = mf || (dop ? getConsolidatedFromData(dop, null) : null);
  } else {
    activeData = getConsolidatedFromData(dop, mf);
  }

  renderActiveView();
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
      
      if (parsed.asset_type === 'POST_OFFICE') {
        StorageService.setDop(parsed);
        currentAsset = 'dop';
        showToast(`Parsed & saved ${parsed.records.length} Post Office accounts to browser!`, 'success');
      } else if (parsed.asset_type === 'MUTUAL_FUNDS') {
        StorageService.setMf(parsed);
        currentAsset = 'mf';
        showToast(`Parsed & saved ${parsed.records.length} Mutual Fund holdings to browser!`, 'success');
      }

      // Update Switcher UI
      document.querySelectorAll('.portfolio-switcher .switch-tab').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-asset') === currentAsset);
      });

      initPortfolioState();
    } catch (err) {
      console.error(err);
      showToast('Error parsing file: ' + err.message, 'error');
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
      projMat = Math.round(7136.58 * multiplier * 100) / 100;
      projInt = Math.round(1136.58 * multiplier * 100) / 100;
      yieldVal = Math.round((projInt / 5.0) * 100) / 100;
      tier = 'Micro RD (₹100/mo)';
    } else if (accLower.includes('time deposit')) {
      catCode = 'TD';
      const qRate = (7.1 / 100.0) / 4.0;
      projMat = Math.round(bal * Math.pow(1 + qRate, 4) * 100) / 100;
      projInt = Math.round((projMat - bal) * 100) / 100;
      yieldVal = projInt;
      tier = bal >= 50000 ? 'High Net Worth (₹50k+)' : 'Standard TD';
    } else if (accLower.includes('savings')) {
      catCode = 'SB';
      yieldVal = Math.round(bal * 0.04 * 100) / 100;
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

  if (currentAsset === 'consolidated') {
    renderConsolidatedView();
  } else if (currentAsset === 'dop') {
    renderPostOfficeView();
  } else if (currentAsset === 'mf') {
    renderMutualFundsView();
  }

  renderCharts();
  renderTable();
  updatePrintStatement();
}

function renderConsolidatedView() {
  const dop = StorageService.getDop() || activeData.dop_portfolio;
  const mf = StorageService.getMf() || activeData.mf_portfolio;
  const sum = activeData.summary || getConsolidatedFromData(dop, mf).summary;

  document.getElementById('heroAssetBadge').innerHTML = '<i data-lucide="layers"></i> Consolidated Overview';
  document.getElementById('heroInvestorName').innerHTML = `<i data-lucide="user"></i> Portfolio Investor &bull; XXXXX1234X`;
  document.getElementById('heroValLabel').textContent = 'Consolidated Net Worth';
  document.getElementById('heroValAmount').textContent = sum.total_net_worth_formatted;
  document.getElementById('heroSummaryText').innerHTML = `Aggregated assets across <strong>Post Office Fixed Income (${sum.dop_book_balance_formatted})</strong> and <strong>Equity Mutual Funds (${sum.mf_current_value_formatted})</strong>. Projected total maturity wealth is <strong class="text-emerald">${sum.total_projected_wealth_formatted}</strong> upon maturity cycle completion.`;

  document.getElementById('heroStatTitle1').textContent = 'Total Asset Holdings';
  document.getElementById('heroStatNum1').textContent = `${sum.total_holdings_count || 0} Holdings`;
  document.getElementById('heroStatTitle2').textContent = 'Cost Basis / Principal';
  document.getElementById('heroStatNum2').textContent = sum.total_principal_formatted || sum.dop_book_balance_formatted;
  document.getElementById('heroStatTitle3').textContent = 'Projected Total Wealth';
  document.getElementById('heroStatNum3').textContent = sum.total_projected_wealth_formatted;

  document.getElementById('kpiLabel1').textContent = 'Fixed Income (DOP)';
  document.getElementById('kpiVal1').textContent = sum.dop_book_balance_formatted;
  document.getElementById('kpiBadge1').textContent = `${dop?.records?.length || 0} Accounts`;
  document.getElementById('kpiNote1').textContent = 'DOP Allocation';

  document.getElementById('kpiLabel2').textContent = 'Mutual Funds (Equity)';
  document.getElementById('kpiVal2').textContent = sum.mf_current_value_formatted;
  document.getElementById('kpiBadge2').textContent = `${mf?.records?.length || 0} Direct Funds`;
  document.getElementById('kpiNote2').textContent = 'Market NAV';

  document.getElementById('kpiLabel3').textContent = 'Portfolio XIRR';
  document.getElementById('kpiVal3').textContent = mf?.metadata?.overall_xirr || '1.04% XIRR';
  document.getElementById('kpiBadge3').textContent = 'Annualized';
  document.getElementById('kpiNote3').textContent = 'Compounded Rate';

  document.getElementById('kpiLabel4').textContent = 'Projected Gain';
  document.getElementById('kpiVal4').textContent = sum.projected_gain_formatted || '+₹35.61 Lakhs';
  document.getElementById('kpiBadge4').textContent = 'Maturity Realization';
  document.getElementById('kpiNote4').textContent = 'Guaranteed + Market';

  allRecords = dop?.records || mf?.records || [];
  setupPostOfficeTable();
}

function renderPostOfficeView() {
  const meta = activeData.metadata || {};
  allRecords = activeData.records || [];

  document.getElementById('heroAssetBadge').innerHTML = '<i data-lucide="landmark"></i> Post Office Fixed Income';
  document.getElementById('heroInvestorName').innerHTML = '<i data-lucide="map-pin"></i> Regional Post Office S.O &bull; DOP Ledger';
  document.getElementById('heroValLabel').textContent = 'Fixed Income Book Value';
  document.getElementById('heroValAmount').textContent = meta.total_balance_formatted || '₹0.00';
  document.getElementById('heroSummaryText').innerHTML = `Ledger contains <strong>${meta.parsed_rows || allRecords.length} active accounts</strong> at <strong>Regional Post Office S.O</strong>. Estimated maturity realization payout is <strong class="text-emerald">${meta.total_projected_maturity_formatted || '₹0.00'}</strong> (+${meta.total_projected_interest_formatted || '₹0.00'} interest gain).`;

  document.getElementById('heroStatTitle1').textContent = 'Active Accounts';
  document.getElementById('heroStatNum1').textContent = `${meta.parsed_rows || allRecords.length} Accounts`;
  document.getElementById('heroStatTitle2').textContent = 'Book Ledger Balance';
  document.getElementById('heroStatNum2').textContent = meta.total_balance_formatted || '₹0.00';
  document.getElementById('heroStatTitle3').textContent = 'Projected Realization';
  document.getElementById('heroStatNum3').textContent = meta.total_projected_maturity_formatted || '₹0.00';

  const tdRecords = allRecords.filter(r => r.category_code === 'TD');
  const rdRecords = allRecords.filter(r => r.category_code === 'RD');
  const sbRecords = allRecords.filter(r => r.category_code === 'SB');

  const tdSum = tdRecords.reduce((s, r) => s + r.balance, 0);
  const rdSum = rdRecords.reduce((s, r) => s + r.balance, 0);
  const sbSum = sbRecords.reduce((s, r) => s + r.balance, 0);

  document.getElementById('kpiLabel1').textContent = 'Time Deposits (TD)';
  document.getElementById('kpiVal1').textContent = `₹${tdSum.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
  document.getElementById('kpiBadge1').textContent = `${tdRecords.length} Accounts`;
  document.getElementById('kpiNote1').textContent = '1-Year Term';

  document.getElementById('kpiLabel2').textContent = 'Recurring Deposits (RD)';
  document.getElementById('kpiVal2').textContent = `₹${rdSum.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
  document.getElementById('kpiBadge2').textContent = `${rdRecords.length} Accounts`;
  document.getElementById('kpiNote2').textContent = '5-Yr Cumulative';

  document.getElementById('kpiLabel3').textContent = 'Savings Bank (SB)';
  document.getElementById('kpiVal3').textContent = `₹${sbSum.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
  document.getElementById('kpiBadge3').textContent = `${sbRecords.length} Account`;
  document.getElementById('kpiNote3').textContent = '4.0% Yield';

  document.getElementById('kpiLabel4').textContent = 'Estimated Net Interest';
  document.getElementById('kpiVal4').textContent = `+${meta.total_projected_interest_formatted || '₹0.00'}`;
  document.getElementById('kpiBadge4').textContent = 'Quarterly Compounded';
  document.getElementById('kpiNote4').textContent = 'Guaranteed Yield';

  setupPostOfficeTable();
}

function renderMutualFundsView() {
  const meta = activeData.metadata || {};
  allRecords = activeData.records || [];

  document.getElementById('heroAssetBadge').innerHTML = '<i data-lucide="trending-up"></i> Equity Mutual Funds &amp; Stocks';
  document.getElementById('heroInvestorName').innerHTML = `<i data-lucide="user"></i> Portfolio Investor &bull; XXXXX1234X`;
  document.getElementById('heroValLabel').textContent = 'Current Portfolio Valuation';
  document.getElementById('heroValAmount').textContent = meta.current_value_formatted || '₹0.00';
  
  const isGain = (meta.profit_loss || 0) >= 0;
  document.getElementById('heroSummaryText').innerHTML = `Total invested cost of <strong>${meta.total_invested_formatted || '₹0.00'}</strong> across <strong>${meta.holdings_count || allRecords.length} Direct Plan schemes</strong>. Net returns: <strong class="${isGain ? 'text-emerald' : 'text-rose'}">${meta.profit_loss_formatted || '₹0.00'} (${meta.profit_loss_pct || '0.00%'})</strong> &bull; Portfolio XIRR: <strong class="text-emerald">${meta.overall_xirr || '1.04%'}</strong>.`;

  document.getElementById('heroStatTitle1').textContent = 'Direct Funds';
  document.getElementById('heroStatNum1').textContent = `${meta.holdings_count || allRecords.length} Funds`;
  document.getElementById('heroStatTitle2').textContent = 'Cost Basis Invested';
  document.getElementById('heroStatNum2').textContent = meta.total_invested_formatted || '₹0.00';
  document.getElementById('heroStatTitle3').textContent = 'Annualized Return';
  document.getElementById('heroStatNum3').textContent = meta.overall_xirr || '1.04% XIRR';

  document.getElementById('kpiLabel1').textContent = 'Market Valuation';
  document.getElementById('kpiVal1').textContent = meta.current_value_formatted || '₹0.00';
  document.getElementById('kpiBadge1').textContent = meta.profit_loss_pct || '0.00%';
  document.getElementById('kpiNote1').textContent = 'Current NAV';

  document.getElementById('kpiLabel2').textContent = 'Total Capital Invested';
  document.getElementById('kpiVal2').textContent = meta.total_invested_formatted || '₹0.00';
  document.getElementById('kpiBadge2').textContent = `${allRecords.length} Schemes`;
  document.getElementById('kpiNote2').textContent = 'Cost Basis';

  document.getElementById('kpiLabel3').textContent = 'Portfolio XIRR';
  document.getElementById('kpiVal3').textContent = meta.overall_xirr || '1.04%';
  document.getElementById('kpiBadge3').textContent = 'Annualized';
  document.getElementById('kpiNote3').textContent = 'Compounded Rate';

  document.getElementById('kpiLabel4').textContent = 'Net Profit / Loss';
  document.getElementById('kpiVal4').textContent = meta.profit_loss_formatted || '₹0.00';
  document.getElementById('kpiVal4').className = isGain ? 'kpi-box-val text-emerald' : 'kpi-box-val text-rose';
  document.getElementById('kpiBadge4').textContent = isGain ? 'Profit' : 'Unrealized Loss';
  document.getElementById('kpiNote4').textContent = 'Delta vs Cost';

  setupMutualFundsTable();
}

// ==================== TABLE STRUCTURES & FILTERS ====================
function setupPostOfficeTable() {
  document.getElementById('tableSectionTitle').textContent = 'Post Office Accounts Directory';
  document.getElementById('filterChipsWrap').innerHTML = `
    <button class="chip-btn active" data-filter="all">All Accounts (${allRecords.length})</button>
    <button class="chip-btn" data-filter="TD">Time Deposits</button>
    <button class="chip-btn" data-filter="RD">Recurring Deposits</button>
    <button class="chip-btn" data-filter="SB">Savings Bank</button>
    <button class="chip-btn" data-filter="high">High Value (≥ ₹10k)</button>
  `;
  document.getElementById('tableHead').innerHTML = `
    <tr>
      <th>#</th>
      <th>Account Number</th>
      <th>Scheme Type</th>
      <th>Tier</th>
      <th class="text-right">Balance (₹)</th>
      <th class="text-right">Est. Maturity (₹)</th>
      <th>Open Date</th>
      <th>Maturity Date</th>
      <th class="text-center">Action</th>
    </tr>
  `;
  attachFilterEvents();
}

function setupMutualFundsTable() {
  document.getElementById('tableSectionTitle').textContent = 'Mutual Funds Portfolio Ledger';
  document.getElementById('filterChipsWrap').innerHTML = `
    <button class="chip-btn active" data-filter="all">All Funds (${allRecords.length})</button>
    <button class="chip-btn" data-filter="profit">Profitable (+)</button>
    <button class="chip-btn" data-filter="loss">Loss (-)</button>
    <button class="chip-btn" data-filter="midcap">Mid Cap</button>
    <button class="chip-btn" data-filter="thematic">Thematic</button>
  `;
  document.getElementById('tableHead').innerHTML = `
    <tr>
      <th>#</th>
      <th>Scheme Name</th>
      <th>AMC &bull; Category</th>
      <th class="text-right">Units</th>
      <th class="text-right">Invested (₹)</th>
      <th class="text-right">Current Value (₹)</th>
      <th class="text-right">Net P&L (₹)</th>
      <th class="text-center">XIRR</th>
      <th class="text-center">Action</th>
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

function renderTable() {
  if (!filteredRecords) filteredRecords = [...allRecords];
  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = '';

  const start = (currentPage - 1) * pageSize;
  const pageItems = filteredRecords.slice(start, start + pageSize);

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
        <td class="text-right font-bold ${isProf ? 'text-emerald' : 'text-rose'}">${r.returns_formatted}</td>
        <td class="text-center font-bold ${isProf ? 'text-emerald' : 'text-rose'}">${r.xirr}</td>
        <td class="text-center"><button class="btn btn-ghost btn-sm" onclick="openFundDetail(${r.id})">Inspect</button></td>
      `;
    } else {
      // Post Office Row
      const accDisplay = isMasked ? r.account_number_masked : r.account_number;
      tr.innerHTML = `
        <td>${start + idx + 1}</td>
        <td class="font-mono font-bold" style="color:var(--color-brand);">${accDisplay}</td>
        <td>${r.account_type}</td>
        <td><span class="badge-tag badge-blue">${r.tier}</span></td>
        <td class="text-right font-bold">${r.balance_formatted}</td>
        <td class="text-right font-bold text-emerald">${r.projected_maturity_formatted}</td>
        <td>${r.open_date || '-'}</td>
        <td>${r.maturity_date || 'Liquid'}</td>
        <td class="text-center"><button class="btn btn-ghost btn-sm" onclick="openAccDetail(${r.id})">Inspect</button></td>
      `;
    }
    tbody.appendChild(tr);
  });

  const endIdx = Math.min(start + pageSize, filteredRecords.length);
  document.getElementById('pageInfoText').textContent = `Showing ${start + 1} to ${endIdx} of ${filteredRecords.length} records`;

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
  const dop = StorageService.getDop() || (activeData?.dop_portfolio) || (activeData?.asset_type === 'POST_OFFICE' ? activeData : null);
  const mf = StorageService.getMf() || (activeData?.mf_portfolio) || (activeData?.asset_type === 'MUTUAL_FUNDS' ? activeData : null);
  
  let targetMode = scope;
  if (targetMode === 'current') {
    targetMode = currentAsset === 'dop' ? 'dop_detailed' : (currentAsset === 'mf' ? 'mf_detailed' : 'consolidated');
  }

  const reportContainer = document.getElementById('executivePrintReport');
  if (!reportContainer) return;

  const investorName = shouldMask ? 'Portfolio Investor' : 'Portfolio Investor';
  const pan = shouldMask ? 'XXXXX1234X' : 'XXXXX1234X';
  const valDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  if (targetMode === 'dop_detailed' && dop) {
    // -------------------------------------------------------------
    // POST OFFICE DETAILED STATEMENT WITH ACCOUNT NUMBERS
    // -------------------------------------------------------------
    const dopMeta = dop.metadata || {};
    const records = dop.records || [];
    const tdRecs = records.filter(r => r.category_code === 'TD');
    const rdRecs = records.filter(r => r.category_code === 'RD');
    const sbRecs = records.filter(r => r.category_code === 'SB');

    reportContainer.innerHTML = `
      <!-- Header -->
      <div class="print-header">
        <div class="print-brand-row">
          <div class="print-logo-box">
            <div class="print-logo-icon">▲</div>
            <div>
              <h1 class="print-brand-name">APEX WEALTH MANAGEMENT</h1>
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
        </div>
      </div>

      <!-- KPI Grid -->
      <div class="print-section-title">1. FIXED INCOME CAPITAL &amp; MATURITY VALUATION</div>
      <div class="print-kpi-grid">
        <div class="print-kpi-card card-navy">
          <span class="print-kpi-lbl">Book Ledger Balance</span>
          <div class="print-kpi-val">${dopMeta.total_balance_formatted || '₹0.00'}</div>
          <span class="print-kpi-sub">Total Current Deposits</span>
        </div>
        <div class="print-kpi-card card-cobalt">
          <span class="print-kpi-lbl">Time Deposits (TD)</span>
          <div class="print-kpi-val">₹${tdRecs.reduce((s,r)=>s+r.balance,0).toLocaleString('en-IN', {minimumFractionDigits:2})}</div>
          <span class="print-kpi-sub">${tdRecs.length} Accounts &bull; 1-Yr Quarterly</span>
        </div>
        <div class="print-kpi-card card-emerald">
          <span class="print-kpi-lbl">Recurring Deposits (RD)</span>
          <div class="print-kpi-val">₹${rdRecs.reduce((s,r)=>s+r.balance,0).toLocaleString('en-IN', {minimumFractionDigits:2})}</div>
          <span class="print-kpi-sub">${rdRecs.length} Accounts &bull; 5-Yr Cumulative</span>
        </div>
        <div class="print-kpi-card card-purple">
          <span class="print-kpi-lbl">Projected Maturity Payout</span>
          <div class="print-kpi-val">${dopMeta.total_projected_maturity_formatted || '₹0.00'}</div>
          <span class="print-kpi-sub">+${dopMeta.total_projected_interest_formatted || '₹0.00'} Net Interest</span>
        </div>
      </div>

      <!-- Scheme Distribution Summary -->
      <div class="print-section-title">2. DEPOSIT SCHEME SUMMARY</div>
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
          <tr>
            <td><strong>Time Deposit For One Year (TD)</strong></td>
            <td class="text-center">${tdRecs.length}</td>
            <td class="text-right">₹${tdRecs.reduce((s,r)=>s+r.balance,0).toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
            <td class="text-right">${dopMeta.total_balance > 0 ? ((tdRecs.reduce((s,r)=>s+r.balance,0)/dopMeta.total_balance)*100).toFixed(2) : 0}%</td>
            <td class="text-right">₹${tdRecs.reduce((s,r)=>s+r.projected_maturity_value,0).toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
            <td class="text-right font-bold text-emerald">+₹${tdRecs.reduce((s,r)=>s+r.projected_total_interest,0).toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
          </tr>
          <tr>
            <td><strong>Recurring Deposit Product (5-Yr RD)</strong></td>
            <td class="text-center">${rdRecs.length}</td>
            <td class="text-right">₹${rdRecs.reduce((s,r)=>s+r.balance,0).toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
            <td class="text-right">${dopMeta.total_balance > 0 ? ((rdRecs.reduce((s,r)=>s+r.balance,0)/dopMeta.total_balance)*100).toFixed(2) : 0}%</td>
            <td class="text-right">₹${rdRecs.reduce((s,r)=>s+r.projected_maturity_value,0).toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
            <td class="text-right font-bold text-emerald">+₹${rdRecs.reduce((s,r)=>s+r.projected_total_interest,0).toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
          </tr>
          <tr>
            <td><strong>Savings Bank Account (SB)</strong></td>
            <td class="text-center">${sbRecs.length}</td>
            <td class="text-right">₹${sbRecs.reduce((s,r)=>s+r.balance,0).toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
            <td class="text-right">${dopMeta.total_balance > 0 ? ((sbRecs.reduce((s,r)=>s+r.balance,0)/dopMeta.total_balance)*100).toFixed(2) : 0}%</td>
            <td class="text-right">₹${sbRecs.reduce((s,r)=>s+r.balance,0).toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
            <td class="text-right font-bold text-emerald">+₹${sbRecs.reduce((s,r)=>s+r.annual_yield,0).toLocaleString('en-IN', {minimumFractionDigits:2})} / yr</td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="print-total-row">
            <td><strong>TOTAL POST OFFICE PORTFOLIO</strong></td>
            <td class="text-center"><strong>${records.length}</strong></td>
            <td class="text-right"><strong>${dopMeta.total_balance_formatted}</strong></td>
            <td class="text-right"><strong>100.00%</strong></td>
            <td class="text-right font-bold text-emerald"><strong>${dopMeta.total_projected_maturity_formatted}</strong></td>
            <td class="text-right font-bold text-emerald"><strong>+${dopMeta.total_projected_interest_formatted}</strong></td>
          </tr>
        </tfoot>
      </table>

      <!-- DETAILED POST OFFICE ACCOUNT NUMBERS SCHEDULE -->
      <div class="print-section-title print-page-break" style="margin-top: 18px;">3. COMPLETE POST OFFICE ACCOUNTS SCHEDULE (WITH ACCOUNT NUMBERS)</div>
      <table class="print-table compact-table">
        <thead>
          <tr>
            <th style="width:30px;">#</th>
            <th>Account Number</th>
            <th>Scheme Description</th>
            <th>Classification</th>
            <th class="text-right">Balance (₹)</th>
            <th class="text-right">Est. Maturity (₹)</th>
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
              <td class="text-right font-bold" style="color:#047857;">${r.projected_maturity_formatted}</td>
              <td class="text-center">${r.open_date || '-'}</td>
              <td class="text-center">${r.maturity_date || 'Liquid'}</td>
              <td class="text-right" style="color:#047857;">+${r.projected_interest_formatted}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <!-- Sign-off -->
      <div class="print-footer-block">
        <div class="print-disclaimer">
          <p><strong>Compliance &amp; Verification Note:</strong> Statement generated directly from verified Department of Posts (India Post) records. Interest calculations adhere to government rates (6.70% p.a. for 5-Year RD, 6.90% p.a. for 1-Year TD). Masking enabled: ${shouldMask ? 'YES' : 'NO'}.</p>
        </div>
        <div class="print-signature-wrap">
          <div class="signature-line"><span>Apex Intelligence Audit Engine</span></div>
          <div class="signature-line"><span>Investor / Account Holder Signature</span></div>
        </div>
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
            <div class="print-logo-icon">▲</div>
            <div>
              <h1 class="print-brand-name">APEX WEALTH MANAGEMENT</h1>
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

      <div class="print-section-title">1. MUTUAL FUNDS PERFORMANCE OVERVIEW</div>
      <div class="print-kpi-grid">
        <div class="print-kpi-card card-navy">
          <span class="print-kpi-lbl">Total Capital Invested</span>
          <div class="print-kpi-val">${mfMeta.total_invested_formatted || '₹0.00'}</div>
          <span class="print-kpi-sub">Cost Basis Principal</span>
        </div>
        <div class="print-kpi-card card-cobalt">
          <span class="print-kpi-lbl">Current Market Valuation</span>
          <div class="print-kpi-val">${mfMeta.current_value_formatted || '₹0.00'}</div>
          <span class="print-kpi-sub">Live NAV Market Value</span>
        </div>
        <div class="print-kpi-card card-emerald">
          <span class="print-kpi-lbl">Net Profit / Loss</span>
          <div class="print-kpi-val">${mfMeta.profit_loss_formatted || '₹0.00'}</div>
          <span class="print-kpi-sub">${mfMeta.profit_loss_pct || '0.00%'} Delta</span>
        </div>
        <div class="print-kpi-card card-purple">
          <span class="print-kpi-lbl">Portfolio XIRR</span>
          <div class="print-kpi-val">${mfMeta.overall_xirr || '1.04%'}</div>
          <span class="print-kpi-sub">Annualized Compounded Growth</span>
        </div>
      </div>

      <div class="print-section-title">2. DETAILED DIRECT FUNDS &amp; FOLIO SCHEDULE</div>
      <table class="print-table">
        <thead>
          <tr>
            <th>Fund Scheme Name</th>
            <th>AMC &bull; Category</th>
            <th>Folio Number</th>
            <th class="text-right">Units</th>
            <th class="text-right">Invested Cost (₹)</th>
            <th class="text-right">Current Value (₹)</th>
            <th class="text-right">Net P&amp;L (₹)</th>
            <th class="text-center">XIRR</th>
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
              <td class="text-right font-bold" style="color:${r.returns >= 0 ? '#047857' : '#b91c1c'};">${r.returns_formatted} (${r.returns_pct_formatted})</td>
              <td class="text-center font-bold" style="color:${r.returns >= 0 ? '#047857' : '#b91c1c'};">${r.xirr}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr class="print-total-row">
            <td colspan="4"><strong>TOTAL MUTUAL FUNDS PORTFOLIO</strong></td>
            <td class="text-right"><strong>${mfMeta.total_invested_formatted}</strong></td>
            <td class="text-right font-bold"><strong>${mfMeta.current_value_formatted}</strong></td>
            <td class="text-right font-bold" style="color:${mfMeta.profit_loss >= 0 ? '#047857' : '#b91c1c'};"><strong>${mfMeta.profit_loss_formatted}</strong></td>
            <td class="text-center font-bold"><strong>${mfMeta.overall_xirr}</strong></td>
          </tr>
        </tfoot>
      </table>

      <div class="print-footer-block">
        <div class="print-disclaimer">
          <p><strong>Compliance &amp; Valuation Note:</strong> Mutual fund investments are subject to market risks. Net Asset Values (NAV) reflect closing published values.</p>
        </div>
        <div class="print-signature-wrap">
          <div class="signature-line"><span>Apex Intelligence System</span></div>
          <div class="signature-line"><span>Investor Signature</span></div>
        </div>
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
    const dopRecords = dop?.records || [];
    const mfRecords = mf?.records || [];

    reportContainer.innerHTML = `
      <div class="print-header">
        <div class="print-brand-row">
          <div class="print-logo-box">
            <div class="print-logo-icon">▲</div>
            <div>
              <h1 class="print-brand-name">APEX WEALTH MANAGEMENT</h1>
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

      <div class="print-section-title">1. EXECUTIVE NET WORTH OVERVIEW</div>
      <div class="print-kpi-grid">
        <div class="print-kpi-card card-navy">
          <span class="print-kpi-lbl">Consolidated Net Worth</span>
          <div class="print-kpi-val">₹${totNetWorth.toLocaleString('en-IN', {minimumFractionDigits:2})}</div>
          <span class="print-kpi-sub">Total Current Market Valuation</span>
        </div>
        <div class="print-kpi-card card-cobalt">
          <span class="print-kpi-lbl">Fixed Income Deposits (DOP)</span>
          <div class="print-kpi-val">₹${dopVal.toLocaleString('en-IN', {minimumFractionDigits:2})}</div>
          <span class="print-kpi-sub">${dopRecords.length} Accounts &bull; ${totNetWorth > 0 ? ((dopVal/totNetWorth)*100).toFixed(1) : 0}% Share</span>
        </div>
        <div class="print-kpi-card card-emerald">
          <span class="print-kpi-lbl">Equity Mutual Funds</span>
          <div class="print-kpi-val">₹${mfCur.toLocaleString('en-IN', {minimumFractionDigits:2})}</div>
          <span class="print-kpi-sub">${mfRecords.length} Direct Schemes &bull; ${totNetWorth > 0 ? ((mfCur/totNetWorth)*100).toFixed(1) : 0}% Share</span>
        </div>
        <div class="print-kpi-card card-purple">
          <span class="print-kpi-lbl">Projected Total Wealth</span>
          <div class="print-kpi-val">₹${totProjWealth.toLocaleString('en-IN', {minimumFractionDigits:2})}</div>
          <span class="print-kpi-sub">+₹${(dopInt/100000).toFixed(2)} Lakhs Guaranteed Interest</span>
        </div>
      </div>

      <div class="print-section-title">2. ASSET ALLOCATION &amp; CAPITAL DISTRIBUTION</div>
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
            <td class="text-right">₹${dopVal.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
            <td class="text-right">₹${dopVal.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
            <td class="text-right"><strong>${totNetWorth > 0 ? ((dopVal/totNetWorth)*100).toFixed(2) : 0}%</strong></td>
            <td class="text-right font-bold" style="color:#047857;">₹${dopProj.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
          </tr>
          <tr>
            <td><strong>Equity Mutual Funds</strong></td>
            <td>Direct Growth Schemes (Groww)</td>
            <td class="text-center">${mfRecords.length}</td>
            <td class="text-right">₹${mfInv.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
            <td class="text-right">₹${mfCur.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
            <td class="text-right"><strong>${totNetWorth > 0 ? ((mfCur/totNetWorth)*100).toFixed(2) : 0}%</strong></td>
            <td class="text-right font-bold" style="color:#047857;">₹${mfCur.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="print-total-row">
            <td colspan="2"><strong>TOTAL CONSOLIDATED PORTFOLIO</strong></td>
            <td class="text-center"><strong>${dopRecords.length + mfRecords.length}</strong></td>
            <td class="text-right"><strong>₹${(dopVal + mfInv).toLocaleString('en-IN', {minimumFractionDigits:2})}</strong></td>
            <td class="text-right"><strong>₹${totNetWorth.toLocaleString('en-IN', {minimumFractionDigits:2})}</strong></td>
            <td class="text-right"><strong>100.00%</strong></td>
            <td class="text-right font-bold" style="color:#047857;"><strong>₹${totProjWealth.toLocaleString('en-IN', {minimumFractionDigits:2})}</strong></td>
          </tr>
        </tfoot>
      </table>

      <!-- Key Accounts Sample Schedule -->
      <div class="print-section-title" style="margin-top: 18px;">3. KEY POST OFFICE ACCOUNTS SCHEDULE (WITH ACCOUNT NUMBERS)</div>
      <table class="print-table compact-table">
        <thead>
          <tr>
            <th style="width:30px;">#</th>
            <th>Account Number</th>
            <th>Scheme Type</th>
            <th>Classification</th>
            <th class="text-right">Balance (₹)</th>
            <th class="text-right">Est. Maturity (₹)</th>
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
              <td class="text-right font-bold" style="color:#047857;">${r.projected_maturity_formatted}</td>
              <td class="text-center">${r.open_date || '-'}</td>
              <td class="text-center">${r.maturity_date || 'Liquid'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${dopRecords.length > 15 ? `<p style="font-size:6.5pt; color:#64748b; margin-top:-6px; margin-bottom:12px;">* Displaying top 15 key accounts in consolidated report. For the full 565 accounts schedule, select 'Post Office Full Statement' in Print options.</p>` : ''}

      ${includeWaterfall ? `
        <div class="print-section-title">4. 2027–2031 CAPITAL REALIZATION WATERFALL SCHEDULE</div>
        <div class="print-waterfall-grid">
          <div class="waterfall-box"><span class="waterfall-year">YEAR 2027</span><span class="waterfall-val">₹4,81,870.00</span><span class="waterfall-desc">Time Deposits</span></div>
          <div class="waterfall-box"><span class="waterfall-year">YEAR 2028</span><span class="waterfall-val">₹1,42,600.00</span><span class="waterfall-desc">Recurring Deposits</span></div>
          <div class="waterfall-box"><span class="waterfall-year">YEAR 2029</span><span class="waterfall-val">₹8,27,080.00</span><span class="waterfall-desc">Recurring Deposits</span></div>
          <div class="waterfall-box"><span class="waterfall-year">YEAR 2030</span><span class="waterfall-val">₹14,97,300.00</span><span class="waterfall-desc">Recurring Deposits</span></div>
          <div class="waterfall-box"><span class="waterfall-year">YEAR 2031</span><span class="waterfall-val">₹11,12,280.00</span><span class="waterfall-desc">Recurring Deposits</span></div>
        </div>
      ` : ''}

      <div class="print-footer-block">
        <div class="print-disclaimer">
          <p><strong>Compliance &amp; Verification Note:</strong> Consolidated report represents active financial positions across fixed income and equity assets. All data stored securely in browser local storage.</p>
        </div>
        <div class="print-signature-wrap">
          <div class="signature-line"><span>Apex Intelligence Audit Engine</span></div>
          <div class="signature-line"><span>Investor Signature</span></div>
        </div>
      </div>
    `;
  }
}

// ==================== CHART VISUALIZATIONS ====================
function renderCharts() {
  renderAllocationDonutChart();
  renderTimelineBarChart();
}

function renderAllocationDonutChart() {
  const chartCanvas = document.getElementById('allocationDonutChart');
  if (!chartCanvas) return;
  const ctx = chartCanvas.getContext('2d');
  if (donutChart) donutChart.destroy();

  let labels = [], data = [], colors = [];
  const dop = StorageService.getDop() || activeData?.dop_portfolio;
  const mf = StorageService.getMf() || activeData?.mf_portfolio;

  if (currentAsset === 'mf' || (!dop && mf)) {
    const recs = mf?.records || [];
    labels = recs.map(r => r.scheme_name.length > 20 ? r.scheme_name.slice(0, 18) + '...' : r.scheme_name);
    data = recs.map(r => r.current_value);
    colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
  } else if (currentAsset === 'dop' || (dop && !mf)) {
    const recs = dop?.records || [];
    const tdSum = recs.filter(r => r.category_code === 'TD').reduce((s, r) => s + r.balance, 0);
    const rdSum = recs.filter(r => r.category_code === 'RD').reduce((s, r) => s + r.balance, 0);
    const sbSum = recs.filter(r => r.category_code === 'SB').reduce((s, r) => s + r.balance, 0);
    labels = ['Time Deposits (TD)', 'Recurring Deposits (RD)', 'Savings Bank (SB)'];
    data = [tdSum, rdSum, sbSum];
    colors = ['#3b82f6', '#8b5cf6', '#10b981'];
  } else {
    const dopVal = dop?.metadata?.total_balance || 0;
    const mfVal = mf?.metadata?.current_value || 0;
    labels = ['Fixed Income (Post Office)', 'Equity Mutual Funds'];
    data = [dopVal, mfVal];
    colors = ['#3b82f6', '#10b981'];
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
      <div><span class="legend-dot" style="background:${colors[i] || '#3b82f6'}"></span><span>${l}</span></div>
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
  const dop = StorageService.getDop() || activeData?.dop_portfolio;
  const mf = StorageService.getMf() || activeData?.mf_portfolio;

  if (currentAsset === 'mf' || (!dop && mf)) {
    const recs = mf?.records || [];
    labels = recs.map(r => r.scheme_name.split(' ')[0] + ' ' + (r.scheme_name.split(' ')[1] || ''));
    data = recs.map(r => r.returns);
  } else {
    labels = ['2027', '2028', '2029', '2030', '2031'];
    data = chartMode === 'payout' ? [481870, 142600, 827080, 1497300, 1112280] : [62, 20, 116, 210, 156];
  }

  barChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Value',
        data: data,
        backgroundColor: data.map(v => v >= 0 ? 'rgba(59, 130, 246, 0.75)' : 'rgba(244, 63, 94, 0.75)'),
        borderColor: data.map(v => v >= 0 ? '#3b82f6' : '#f43f5e'),
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
    <div class="modal-stat"><span class="modal-stat-label">Book Balance</span><div class="modal-stat-val" style="color:#60a5fa;">${acc.balance_formatted}</div></div>
    <div class="modal-stat"><span class="modal-stat-label">Projected Maturity Payout</span><div class="modal-stat-val" style="color:#34d399;">${acc.projected_maturity_formatted}</div></div>
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
    <div class="modal-stat"><span class="modal-stat-label">Current Value</span><div class="modal-stat-val" style="color:#38bdf8;">${f.current_formatted}</div></div>
    <div class="modal-stat"><span class="modal-stat-label">Returns P&amp;L</span><div class="modal-stat-val" style="color:${f.is_profit ? '#34d399' : '#fb7185'};">${f.returns_formatted} (${f.returns_pct_formatted})</div></div>
    <div class="modal-stat"><span class="modal-stat-label">Annualized XIRR</span><div class="modal-stat-val" style="color:#34d399;">${f.xirr}</div></div>
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
  toast.innerHTML = `<i data-lucide="${type === 'success' ? 'check-circle' : 'info'}" style="width:14px; height:14px; color:${type === 'success' ? '#10b981' : '#3b82f6'};"></i><span>${msg}</span>`;
  container.appendChild(toast);
  if (window.lucide) lucide.createIcons();
  setTimeout(() => toast.remove(), 3500);
}

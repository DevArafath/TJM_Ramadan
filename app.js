// Global Variables
let masterMembers = [];
let registeredMembers = []; // Loaded from registered.json

let savedRegistrations = [];
let savedIssuedPorridge = [];

let regScanner = null;
let issueScanner = null;

let isRegScannerActive = false;
let isIssueScannerActive = false;

let currentEditingMember = null;
let showAllRegRecords = false;
let showAllIssueRecords = false;

let deferredPwaPrompt = null;

const REG_STORAGE_KEY = 'tjm_ramadan_registrations';
const ISSUE_STORAGE_KEY = 'tjm_ramadan_porridge_issued';

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  registerServiceWorker();
  await loadMasterData();
  loadLocalStorageData();
  initFamilyCountButtons();
  renderRegTable();
  renderIssueTable();
  updateDashboardStats();

  updateRegScannerBtnUI(false);
  updateIssueScannerBtnUI(false);
});

// Service Worker Registration
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js')
      .then(() => console.log('Service Worker Registered'))
      .catch((err) => console.error('SW Error:', err));
  }
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPwaPrompt = e;
  const pwaBtn = document.getElementById('pwaInstallBtn');
  if (pwaBtn) pwaBtn.style.display = 'inline-block';
});

function triggerPwaInstall() {
  if (deferredPwaPrompt) {
    deferredPwaPrompt.prompt();
    deferredPwaPrompt.userChoice.then(() => {
      deferredPwaPrompt = null;
      document.getElementById('pwaInstallBtn').style.display = 'none';
    });
  }
}

// Fetch JSON Data
async function loadMasterData() {
  try {
    const [resMaster, resReg] = await Promise.all([
      fetch('./master_members.json').catch(() => null),
      fetch('./registered.json').catch(() => null)
    ]);

    if (resMaster && resMaster.ok) masterMembers = await resMaster.json();
    if (resReg && resReg.ok) registeredMembers = await resReg.json();
  } catch (error) {
    console.error('Error loading JSON files:', error);
  }
}

function loadLocalStorageData() {
  const regData = localStorage.getItem(REG_STORAGE_KEY);
  savedRegistrations = regData ? JSON.parse(regData) : [];

  const issueData = localStorage.getItem(ISSUE_STORAGE_KEY);
  savedIssuedPorridge = issueData ? JSON.parse(issueData) : [];
}

// Visual Screen Flash Feedback
function flashScreenBorder(type) {
  document.body.classList.remove('flash-success', 'flash-warning', 'flash-error');
  if (type === 'success') document.body.classList.add('flash-success');
  else if (type === 'warning') document.body.classList.add('flash-warning');
  else if (type === 'error') document.body.classList.add('flash-error');

  setTimeout(() => {
    document.body.classList.remove('flash-success', 'flash-warning', 'flash-error');
  }, 1200);
}

// Sound Helper
function playSound(soundFileName) {
  let targetSound = soundFileName;
  if (!isNaN(soundFileName)) {
    let countNum = parseInt(soundFileName, 10);
    if (countNum > 12) countNum = 12;
    if (countNum < 1) countNum = 1;
    targetSound = `${countNum}.mp3`;
  }

  const audio = new Audio(`sounds/${targetSound}`);
  audio.play().catch((err) => console.log('Audio playback blocked:', err));
}

// Date Format Helper (YYYY-MM-DD)
function getTodayDateString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Dashboard Stats Calculation
function updateDashboardStats() {
  const todayStr = new Date().toLocaleDateString();

  const todayTransactions = savedIssuedPorridge.filter(i => i.timestamp && i.timestamp.startsWith(todayStr));
  const todayTotalCount = todayTransactions.reduce((acc, curr) => acc + (parseInt(curr.count) || 0), 0);

  document.getElementById('statTodayQuantity').textContent = todayTotalCount;
  document.getElementById('statTodayTransactions').textContent = todayTransactions.length;
  document.getElementById('statTotalRegistrations').textContent = savedRegistrations.length;
  document.getElementById('statRegisteredFileCount').textContent = registeredMembers.length;
}

// Views Navigation
function showRegistrationView() {
  document.getElementById('dashboardSection').style.display = 'none';
  document.getElementById('issuePorridgeView').style.display = 'none';
  document.getElementById('registrationView').style.display = 'block';
  stopIssueScanner();
  stopRegScanner();
}

function showIssuePorridgeView() {
  document.getElementById('dashboardSection').style.display = 'none';
  document.getElementById('registrationView').style.display = 'none';
  document.getElementById('issuePorridgeView').style.display = 'block';
  stopRegScanner();
  stopIssueScanner();
}

function showDashboardView() {
  document.getElementById('registrationView').style.display = 'none';
  document.getElementById('issuePorridgeView').style.display = 'none';
  document.getElementById('dashboardSection').style.display = 'flex';
  stopRegScanner();
  stopIssueScanner();
  updateDashboardStats();
}

/* ==========================================================================
   1. REGISTRATION MODULE & AUTOSUGGEST
   ========================================================================== */

function startRegScanner() {
  if (isRegScannerActive) return;

  regScanner = new Html5Qrcode("qr-reader");
  const config = { fps: 10, qrbox: { width: 250, height: 250 } };

  regScanner.start(
    { facingMode: "environment" },
    config,
    (decodedText) => {
      stopRegScanner();
      processRegMemberId(decodedText.trim(), true);
    }
  ).then(() => {
    isRegScannerActive = true;
    updateRegScannerBtnUI(true);
  }).catch(() => {
    isRegScannerActive = false;
    updateRegScannerBtnUI(false);
  });
}

function stopRegScanner() {
  if (regScanner && isRegScannerActive) {
    regScanner.stop().then(() => {
      isRegScannerActive = false;
      updateRegScannerBtnUI(false);
    }).catch(err => console.error("Reg scanner stop error:", err));
  } else {
    isRegScannerActive = false;
    updateRegScannerBtnUI(false);
  }
}

function toggleRegCamera() {
  if (isRegScannerActive) stopRegScanner();
  else startRegScanner();
}

function updateRegScannerBtnUI(active) {
  const btn = document.getElementById('toggleRegCameraBtn');
  if (!btn) return;
  btn.innerHTML = active ? `<i class="fa-solid fa-pause me-1"></i> Pause Scanner` : `<i class="fa-solid fa-play me-1"></i> Start Scanner`;
  btn.className = active ? "btn btn-outline-warning btn-sm rounded-pill" : "btn btn-outline-primary btn-sm rounded-pill";
}

function handleRegAutosuggest(query) {
  const dropdown = document.getElementById('regSuggestions');
  const val = query.trim().toLowerCase();
  if (!val) {
    dropdown.style.display = 'none';
    return;
  }

  const matches = masterMembers.filter(m => 
    m.id.toLowerCase().includes(val) || m.name.toLowerCase().includes(val)
  ).slice(0, 6);

  if (matches.length === 0) {
    dropdown.style.display = 'none';
    return;
  }

  dropdown.innerHTML = matches.map(m => `
    <div class="suggestion-item" onclick="selectRegSuggestion('${escapeHtml(m.id)}')">
      <strong>${escapeHtml(m.id)}</strong> - <small class="text-muted">${escapeHtml(m.name)}</small>
    </div>
  `).join('');
  dropdown.style.display = 'block';
}

function selectRegSuggestion(id) {
  document.getElementById('manualIdInput').value = id;
  document.getElementById('regSuggestions').style.display = 'none';
  handleManualSubmit();
}

function handleManualSubmit() {
  const input = document.getElementById('manualIdInput');
  const val = input.value.trim();
  if (!val) {
    Swal.fire('Warning', 'Please enter a valid Membership ID', 'warning');
    return;
  }
  const wasScanning = isRegScannerActive;
  stopRegScanner();
  processRegMemberId(val, wasScanning);
  input.value = '';
  document.getElementById('regSuggestions').style.display = 'none';
}

function processRegMemberId(memberId, shouldRestartScanner = false) {
  const existingRecord = savedRegistrations.find(item => item.id.toLowerCase() === memberId.toLowerCase());
  if (existingRecord) {
    playSound('scan_duplicate.mp3');
    flashScreenBorder('warning');
    Swal.fire({
      icon: 'warning',
      title: 'Already Registered Card!',
      html: `
        <div class="text-start">
          <p><strong>ID:</strong> ${existingRecord.id}</p>
          <p><strong>Name:</strong> ${existingRecord.name}</p>
          <p><strong>Family Count:</strong> ${existingRecord.familyCount}</p>
          <p><strong>Scanned At:</strong> ${existingRecord.timestamp}</p>
        </div>
      `
    }).then(() => { if (shouldRestartScanner) startRegScanner(); });
    return;
  }

  const matchedMember = masterMembers.find(item => item.id.toLowerCase() === memberId.toLowerCase());
  if (!matchedMember) {
    playSound('scan_warning.mp3');
    flashScreenBorder('error');
    Swal.fire({
      icon: 'error',
      title: 'Member Not Found',
      text: `No master record found matching ID: ${memberId}`
    }).then(() => { if (shouldRestartScanner) startRegScanner(); });
    return;
  }

  currentEditingMember = { ...matchedMember, isEditMode: false, wasScanningBefore: shouldRestartScanner };
  openMemberModal(matchedMember.id, matchedMember.name);
}

function initFamilyCountButtons() {
  const container = document.getElementById('familyCountButtons');
  container.innerHTML = '';
  for (let i = 1; i <= 12; i++) {
    const col = document.createElement('div');
    col.className = 'col-3 col-sm-2';
    col.innerHTML = `
      <button class="btn btn-outline-primary badge-count w-100 d-flex align-items-center justify-content-center" 
              onclick="selectFamilyCount(${i})">${i}</button>
    `;
    container.appendChild(col);
  }
}

function openMemberModal(id, name) {
  document.getElementById('modalMemberId').textContent = id;
  document.getElementById('modalMemberName').textContent = name;
  const modalEl = new bootstrap.Modal(document.getElementById('memberModal'));
  modalEl.show();
}

function closeMemberModal() {
  const modalEl = bootstrap.Modal.getInstance(document.getElementById('memberModal'));
  if (modalEl) modalEl.hide();
  if (currentEditingMember && currentEditingMember.wasScanningBefore) startRegScanner();
  currentEditingMember = null;
}

function selectFamilyCount(count) {
  playSound(`${count}.mp3`);
  flashScreenBorder('success');

  const now = new Date();
  const timestampStr = now.toLocaleDateString() + ' ' + now.toLocaleTimeString();

  const shouldRestartScanner = currentEditingMember ? currentEditingMember.wasScanningBefore : false;

  if (currentEditingMember.isEditMode) {
    const idx = savedRegistrations.findIndex(r => r.id === currentEditingMember.id);
    if (idx !== -1) {
      savedRegistrations[idx].familyCount = count;
      savedRegistrations[idx].timestamp = timestampStr;
    }
  } else {
    savedRegistrations.unshift({
      id: currentEditingMember.id,
      name: currentEditingMember.name,
      familyCount: count,
      timestamp: timestampStr
    });
  }

  localStorage.setItem(REG_STORAGE_KEY, JSON.stringify(savedRegistrations));
  renderRegTable();
  updateDashboardStats();

  const modalEl = bootstrap.Modal.getInstance(document.getElementById('memberModal'));
  if (modalEl) modalEl.hide();

  currentEditingMember = null;
  if (shouldRestartScanner) startRegScanner();
}

function renderRegTable() {
  const tbody = document.getElementById('membersTableBody');
  tbody.innerHTML = '';

  const displayList = showAllRegRecords ? savedRegistrations : savedRegistrations.slice(0, 25);

  displayList.forEach((item) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="fw-bold">${escapeHtml(item.id)}</td>
      <td>${escapeHtml(item.name)}</td>
      <td class="text-center"><span class="badge bg-primary rounded-pill px-3 py-2">${item.familyCount}</span></td>
      <td><small class="text-muted">${item.timestamp}</small></td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-secondary me-1" onclick="editRegRecord('${item.id}')" title="Edit"><i class="fa-solid fa-pen-to-square"></i></button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteRegRecord('${item.id}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('totalSavedCount').textContent = `${savedRegistrations.length} Records Saved`;
}

function toggleRecordViewLimit() {
  showAllRegRecords = !showAllRegRecords;
  document.getElementById('regTableSubtitle').textContent = showAllRegRecords ? `Displaying all ${savedRegistrations.length} records` : `Displaying recent 25 records`;
  renderRegTable();
}

function editRegRecord(id) {
  const wasScanning = isRegScannerActive;
  stopRegScanner();

  const record = savedRegistrations.find(r => r.id === id);
  if (!record) return;

  currentEditingMember = { ...record, isEditMode: true, wasScanningBefore: wasScanning };
  openMemberModal(record.id, record.name);
}

function deleteRegRecord(id) {
  const record = savedRegistrations.find(r => r.id === id);
  if (!record) return;

  Swal.fire({
    title: 'Confirm Deletion',
    html: `Delete registration for ID: <strong>${record.id}</strong>?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc3545',
    confirmButtonText: 'Delete'
  }).then((result) => {
    if (result.isConfirmed) {
      savedRegistrations = savedRegistrations.filter(r => r.id !== id);
      localStorage.setItem(REG_STORAGE_KEY, JSON.stringify(savedRegistrations));
      renderRegTable();
      updateDashboardStats();
      Swal.fire('Deleted!', 'Record removed.', 'success');
    }
  });
}

function confirmResetLocalStorage() {
  Swal.fire({
    title: 'Reset All Data?',
    text: 'Wipe all saved member registrations stored locally?',
    icon: 'error',
    showCancelButton: true,
    confirmButtonColor: '#dc3545',
    confirmButtonText: 'Yes, Wipe Everything'
  }).then((result) => {
    if (result.isConfirmed) {
      savedRegistrations = [];
      localStorage.removeItem(REG_STORAGE_KEY);
      renderRegTable();
      updateDashboardStats();
      Swal.fire('Reset Complete', 'Registration data wiped.', 'info');
    }
  });
}

function exportToExcel() {
  if (savedRegistrations.length === 0) {
    Swal.fire('No Data', 'No records available to export.', 'info');
    return;
  }

  const exportData = savedRegistrations.map((item, index) => ({
    'S/N': index + 1,
    'Membership ID': item.id,
    'Member Name': item.name,
    'Family Member Count': item.familyCount,
    'Registration Date & Time': item.timestamp
  }));

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Registrations");
  XLSX.writeFile(workbook, `TJM_Ramadan_Registrations_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/* ==========================================================================
   2. ISSUE PORRIDGE MODULE & DAILY DUP CHECK
   ========================================================================== */

function startIssueScanner() {
  if (isIssueScannerActive) return;

  issueScanner = new Html5Qrcode("qr-reader-issue");
  const config = { fps: 10, qrbox: { width: 250, height: 250 } };

  issueScanner.start(
    { facingMode: "environment" },
    config,
    (decodedText) => {
      stopIssueScanner();
      processIssueMemberId(decodedText.trim(), true);
    }
  ).then(() => {
    isIssueScannerActive = true;
    updateIssueScannerBtnUI(true);
  }).catch(() => {
    isIssueScannerActive = false;
    updateIssueScannerBtnUI(false);
  });
}

function stopIssueScanner() {
  if (issueScanner && isIssueScannerActive) {
    issueScanner.stop().then(() => {
      isIssueScannerActive = false;
      updateIssueScannerBtnUI(false);
    }).catch(err => console.error("Issue scanner stop error:", err));
  } else {
    isIssueScannerActive = false;
    updateIssueScannerBtnUI(false);
  }
}

function toggleIssueCamera() {
  if (isIssueScannerActive) stopIssueScanner();
  else startIssueScanner();
}

function updateIssueScannerBtnUI(active) {
  const btn = document.getElementById('toggleIssueCameraBtn');
  if (!btn) return;
  btn.innerHTML = active ? `<i class="fa-solid fa-pause me-1"></i> Pause Scanner` : `<i class="fa-solid fa-play me-1"></i> Start Scanner`;
  btn.className = active ? "btn btn-outline-warning btn-sm rounded-pill" : "btn btn-outline-success btn-sm rounded-pill";
}

function handleIssueAutosuggest(query) {
  const dropdown = document.getElementById('issueSuggestions');
  const val = query.trim().toLowerCase();
  if (!val) {
    dropdown.style.display = 'none';
    return;
  }

  const matches = registeredMembers.filter(m => 
    m.id.toLowerCase().includes(val) || m.name.toLowerCase().includes(val)
  ).slice(0, 6);

  if (matches.length === 0) {
    dropdown.style.display = 'none';
    return;
  }

  dropdown.innerHTML = matches.map(m => `
    <div class="suggestion-item" onclick="selectIssueSuggestion('${escapeHtml(m.id)}')">
      <strong>${escapeHtml(m.id)}</strong> - <small class="text-muted">${escapeHtml(m.name)} (Count: ${m.count})</small>
    </div>
  `).join('');
  dropdown.style.display = 'block';
}

function selectIssueSuggestion(id) {
  document.getElementById('manualIssueIdInput').value = id;
  document.getElementById('issueSuggestions').style.display = 'none';
  handleManualIssueSubmit();
}

function handleManualIssueSubmit() {
  const input = document.getElementById('manualIssueIdInput');
  const val = input.value.trim();
  if (!val) {
    Swal.fire('Warning', 'Please enter a valid Membership ID', 'warning');
    return;
  }
  const wasScanning = isIssueScannerActive;
  stopIssueScanner();
  processIssueMemberId(val, wasScanning);
  input.value = '';
  document.getElementById('issueSuggestions').style.display = 'none';
}

function processIssueMemberId(memberId, shouldRestartScanner = false) {
  const todayStr = new Date().toLocaleDateString();

  // Daily Duplicate Check
  const alreadyIssuedToday = savedIssuedPorridge.find(item => 
    item.id.toLowerCase() === memberId.toLowerCase() && 
    item.timestamp && item.timestamp.startsWith(todayStr)
  );

  if (alreadyIssuedToday) {
    playSound('scan_duplicate.mp3');
    flashScreenBorder('warning');
    Swal.fire({
      icon: 'warning',
      title: 'Porridge Already Issued Today!',
      html: `
        <div class="text-start">
          <p><strong>ID:</strong> ${alreadyIssuedToday.id}</p>
          <p><strong>Name:</strong> ${alreadyIssuedToday.name}</p>
          <p><strong>Count:</strong> ${alreadyIssuedToday.count}</p>
          <p><strong>Issued At:</strong> ${alreadyIssuedToday.timestamp}</p>
        </div>
      `
    }).then(() => { if (shouldRestartScanner) startIssueScanner(); });
    return;
  }

  // Check registered.json
  const registeredMember = registeredMembers.find(item => item.id.toLowerCase() === memberId.toLowerCase());
  if (!registeredMember) {
    playSound('scan_warning.mp3');
    flashScreenBorder('error');
    Swal.fire({
      icon: 'error',
      title: 'Not Pre-Registered',
      text: `Card ${memberId} was not found in registered.json!`
    }).then(() => { if (shouldRestartScanner) startIssueScanner(); });
    return;
  }

  // Success Flow
  playSound(registeredMember.count);
  flashScreenBorder('success');

  const now = new Date();
  const timestampStr = now.toLocaleDateString() + ' ' + now.toLocaleTimeString();

  savedIssuedPorridge.unshift({
    id: registeredMember.id,
    name: registeredMember.name,
    count: registeredMember.count,
    timestamp: timestampStr,
    dateKey: getTodayDateString()
  });

  localStorage.setItem(ISSUE_STORAGE_KEY, JSON.stringify(savedIssuedPorridge));
  renderIssueTable();
  updateDashboardStats();

  Swal.fire({
    icon: 'success',
    title: 'Porridge Issued Successfully!',
    html: `
      <div class="text-start">
        <p><strong>ID:</strong> ${registeredMember.id}</p>
        <p><strong>Name:</strong> ${registeredMember.name}</p>
        <p><strong>Count:</strong> <span class="badge bg-success fs-6">${registeredMember.count}</span></p>
      </div>
    `,
    timer: 2200,
    showConfirmButton: true
  }).then(() => { if (shouldRestartScanner) startIssueScanner(); });
}

function renderIssueTable() {
  const tbody = document.getElementById('issuedTableBody');
  tbody.innerHTML = '';

  const displayList = showAllIssueRecords ? savedIssuedPorridge : savedIssuedPorridge.slice(0, 25);

  displayList.forEach((item) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="fw-bold">${escapeHtml(item.id)}</td>
      <td>${escapeHtml(item.name)}</td>
      <td class="text-center"><span class="badge bg-success rounded-pill px-3 py-2">${item.count}</span></td>
      <td><small class="text-muted">${item.timestamp}</small></td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-danger" onclick="deleteIssueRecord('${item.id}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('totalIssuedCount').textContent = `${savedIssuedPorridge.length} Porridge Issued`;
}

function toggleIssueRecordViewLimit() {
  showAllIssueRecords = !showAllIssueRecords;
  document.getElementById('issueTableSubtitle').textContent = showAllIssueRecords ? `Displaying all ${savedIssuedPorridge.length} issued records` : `Displaying recent 25 issued records`;
  renderIssueTable();
}

function deleteIssueRecord(id) {
  const record = savedIssuedPorridge.find(r => r.id === id);
  if (!record) return;

  Swal.fire({
    title: 'Confirm Deletion',
    html: `Remove porridge issuance record for <strong>${record.id}</strong>?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc3545',
    confirmButtonText: 'Delete'
  }).then((result) => {
    if (result.isConfirmed) {
      savedIssuedPorridge = savedIssuedPorridge.filter(r => r.id !== id);
      localStorage.setItem(ISSUE_STORAGE_KEY, JSON.stringify(savedIssuedPorridge));
      renderIssueTable();
      updateDashboardStats();
      Swal.fire('Deleted!', 'Issuance log removed.', 'success');
    }
  });
}

function confirmResetIssueStorage() {
  Swal.fire({
    title: 'Reset All Issuance Data?',
    text: 'Wipe all saved porridge issuance logs stored locally!',
    icon: 'error',
    showCancelButton: true,
    confirmButtonColor: '#dc3545',
    confirmButtonText: 'Yes, Wipe Everything'
  }).then((result) => {
    if (result.isConfirmed) {
      savedIssuedPorridge = [];
      localStorage.removeItem(ISSUE_STORAGE_KEY);
      renderIssueTable();
      updateDashboardStats();
      Swal.fire('Reset Complete', 'Issuance data wiped.', 'info');
    }
  });
}

function exportIssueToExcel() {
  if (savedIssuedPorridge.length === 0) {
    Swal.fire('No Data', 'No issued records available to export.', 'info');
    return;
  }

  const exportData = savedIssuedPorridge.map((item, index) => ({
    'S/N': index + 1,
    'Membership ID': item.id,
    'Member Name': item.name,
    'Porridge Count': item.count,
    'Issued Date & Time': item.timestamp
  }));

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Issued Porridge");
  XLSX.writeFile(workbook, `TJM_Ramadan_Porridge_Issued_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/* ==========================================================================
   3. BACKUP & RESTORE MODULE (JSON)
   ========================================================================== */

function exportBackupData() {
  const backupObject = {
    registrations: savedRegistrations,
    issuedPorridge: savedIssuedPorridge,
    exportedAt: new Date().toISOString()
  };

  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupObject, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `TJM_Ramadan_Backup_${new Date().toISOString().slice(0, 10)}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

function triggerRestoreInput() {
  document.getElementById('restoreFileInput').click();
}

function importBackupData(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const importedData = JSON.parse(e.target.result);
      if (importedData.registrations && importedData.issuedPorridge) {
        savedRegistrations = importedData.registrations;
        savedIssuedPorridge = importedData.issuedPorridge;

        localStorage.setItem(REG_STORAGE_KEY, JSON.stringify(savedRegistrations));
        localStorage.setItem(ISSUE_STORAGE_KEY, JSON.stringify(savedIssuedPorridge));

        renderRegTable();
        renderIssueTable();
        updateDashboardStats();

        Swal.fire('Backup Restored', 'Data successfully restored from file!', 'success');
      } else {
        Swal.fire('Error', 'Invalid backup file structure.', 'error');
      }
    } catch (err) {
      Swal.fire('Error', 'Failed to parse JSON backup file.', 'error');
    }
  };
  reader.readAsText(file);
}

// Utility
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
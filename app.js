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

// Fetch master_members.json & registered.json
async function loadMasterData() {
  try {
    const [resMaster, resReg] = await Promise.all([
      fetch('./master_members.json').catch(() => null),
      fetch('./registered.json').catch(() => null)
    ]);

    if (resMaster && resMaster.ok) {
      masterMembers = await resMaster.json();
    }
    if (resReg && resReg.ok) {
      registeredMembers = await resReg.json();
    }
  } catch (error) {
    console.error('Error loading JSON data files:', error);
  }
}

function loadLocalStorageData() {
  const regData = localStorage.getItem(REG_STORAGE_KEY);
  savedRegistrations = regData ? JSON.parse(regData) : [];

  const issueData = localStorage.getItem(ISSUE_STORAGE_KEY);
  savedIssuedPorridge = issueData ? JSON.parse(issueData) : [];
}

// Sound Helper
function playSound(soundFileName) {
  // Clamp number audio to 1-12 if numeric count > 12
  let targetSound = soundFileName;
  if (!isNaN(soundFileName)) {
    let countNum = parseInt(soundFileName, 10);
    if (countNum > 12) countNum = 12;
    if (countNum < 1) countNum = 1;
    targetSound = `${countNum}.mp3`;
  }

  const audio = new Audio(`sounds/${targetSound}`);
  audio.play().catch((err) => console.log('Audio playback prevented:', err));
}

// View Switches
function showRegistrationView() {
  document.getElementById('dashboardSection').style.display = 'none';
  document.getElementById('issuePorridgeView').style.display = 'none';
  document.getElementById('registrationView').style.display = 'block';
  stopIssueScanner();
  startRegScanner();
}

function showIssuePorridgeView() {
  document.getElementById('dashboardSection').style.display = 'none';
  document.getElementById('registrationView').style.display = 'none';
  document.getElementById('issuePorridgeView').style.display = 'block';
  stopRegScanner();
  startIssueScanner();
}

function showDashboardView() {
  document.getElementById('registrationView').style.display = 'none';
  document.getElementById('issuePorridgeView').style.display = 'none';
  document.getElementById('dashboardSection').style.display = 'flex';
  stopRegScanner();
  stopIssueScanner();
}

/* ==========================================================================
   1. REGISTRATION MODULE SCANNERS & HANDLERS
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
      processRegMemberId(decodedText.trim());
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

function handleManualSubmit() {
  const input = document.getElementById('manualIdInput');
  const val = input.value.trim();
  if (!val) {
    Swal.fire('Warning', 'Please enter a valid Membership ID', 'warning');
    return;
  }
  stopRegScanner();
  processRegMemberId(val);
  input.value = '';
}

function processRegMemberId(memberId) {
  const existingRecord = savedRegistrations.find(item => item.id.toLowerCase() === memberId.toLowerCase());
  if (existingRecord) {
    playSound('scan_duplicate.mp3');
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
    }).then(() => startRegScanner());
    return;
  }

  const matchedMember = masterMembers.find(item => item.id.toLowerCase() === memberId.toLowerCase());
  if (!matchedMember) {
    playSound('scan_warning.mp3');
    Swal.fire({
      icon: 'error',
      title: 'Member Not Found',
      text: `No master record found matching ID: ${memberId}`
    }).then(() => startRegScanner());
    return;
  }

  currentEditingMember = { ...matchedMember, isEditMode: false };
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
  currentEditingMember = null;
  startRegScanner();
}

function selectFamilyCount(count) {
  playSound(`${count}.mp3`);

  const now = new Date();
  const timestampStr = now.toLocaleDateString() + ' ' + now.toLocaleTimeString();

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

  const modalEl = bootstrap.Modal.getInstance(document.getElementById('memberModal'));
  if (modalEl) modalEl.hide();

  currentEditingMember = null;
  startRegScanner();
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
  stopRegScanner();
  const record = savedRegistrations.find(r => r.id === id);
  if (!record) return;

  currentEditingMember = { ...record, isEditMode: true };
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
      Swal.fire('Deleted!', 'Record removed.', 'success');
    }
  });
}

function confirmResetLocalStorage() {
  Swal.fire({
    title: 'Reset All Data?',
    text: 'This action will wipe all saved member registrations stored locally!',
    icon: 'error',
    showCancelButton: true,
    confirmButtonColor: '#dc3545',
    confirmButtonText: 'Yes, Wipe Everything'
  }).then((result) => {
    if (result.isConfirmed) {
      savedRegistrations = [];
      localStorage.removeItem(REG_STORAGE_KEY);
      renderRegTable();
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
   2. ISSUE PORRIDGE MODULE SCANNERS & HANDLERS
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
      processIssueMemberId(decodedText.trim());
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

function handleManualIssueSubmit() {
  const input = document.getElementById('manualIssueIdInput');
  const val = input.value.trim();
  if (!val) {
    Swal.fire('Warning', 'Please enter a valid Membership ID', 'warning');
    return;
  }
  stopIssueScanner();
  processIssueMemberId(val);
  input.value = '';
}

function processIssueMemberId(memberId) {
  // 1. Check Duplicate Issue
  const alreadyIssued = savedIssuedPorridge.find(item => item.id.toLowerCase() === memberId.toLowerCase());
  if (alreadyIssued) {
    playSound('scan_duplicate.mp3');
    Swal.fire({
      icon: 'warning',
      title: 'Porridge Already Issued!',
      html: `
        <div class="text-start">
          <p><strong>ID:</strong> ${alreadyIssued.id}</p>
          <p><strong>Name:</strong> ${alreadyIssued.name}</p>
          <p><strong>Porridge Count:</strong> ${alreadyIssued.count}</p>
          <p><strong>Issued At:</strong> ${alreadyIssued.timestamp}</p>
        </div>
      `
    }).then(() => startIssueScanner());
    return;
  }

  // 2. Fetch from registered.json
  const registeredMember = registeredMembers.find(item => item.id.toLowerCase() === memberId.toLowerCase());
  if (!registeredMember) {
    playSound('scan_warning.mp3');
    Swal.fire({
      icon: 'error',
      title: 'Not Pre-Registered',
      text: `Card ${memberId} was not found in registered.json!`
    }).then(() => startIssueScanner());
    return;
  }

  // 3. Play Sound associated with member count
  playSound(registeredMember.count);

  const now = new Date();
  const timestampStr = now.toLocaleDateString() + ' ' + now.toLocaleTimeString();

  // Save transaction
  savedIssuedPorridge.unshift({
    id: registeredMember.id,
    name: registeredMember.name,
    count: registeredMember.count,
    timestamp: timestampStr
  });

  localStorage.setItem(ISSUE_STORAGE_KEY, JSON.stringify(savedIssuedPorridge));
  renderIssueTable();

  // Success Alert
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
    timer: 2500,
    showConfirmButton: true
  }).then(() => startIssueScanner());
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
      Swal.fire('Deleted!', 'Issuance log removed.', 'success');
    }
  });
}

function confirmResetIssueStorage() {
  Swal.fire({
    title: 'Reset All Issuance Data?',
    text: 'This action will wipe all saved porridge issuance logs stored locally!',
    icon: 'error',
    showCancelButton: true,
    confirmButtonColor: '#dc3545',
    confirmButtonText: 'Yes, Wipe Everything'
  }).then((result) => {
    if (result.isConfirmed) {
      savedIssuedPorridge = [];
      localStorage.removeItem(ISSUE_STORAGE_KEY);
      renderIssueTable();
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

// Escaping utility
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
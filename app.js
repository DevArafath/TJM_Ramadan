// Global State Variables
let masterMembers = [];
let savedRegistrations = [];
let html5QrcodeScanner = null;
let isScannerActive = false;
let currentEditingMember = null;
let showAllRecords = false;
let dataTableInstance = null;
let deferredPwaPrompt = null;

const STORAGE_KEY = 'tjm_ramadan_registrations';

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
  registerServiceWorker();
  await loadMasterMembers();
  loadSavedRegistrations();
  initFamilyCountButtons();
  initDataTable();
  renderSavedTable();
});

// PWA Service Worker Registration
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js')
      .then(() => console.log('Service Worker Registered'))
      .catch((err) => console.error('SW Registration Error:', err));
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

// Fetch Master Members JSON Data
async function loadMasterMembers() {
  try {
    const response = await fetch('./master_members.json');
    if (!response.ok) throw new Error('Network response was not ok');
    masterMembers = await response.json();
  } catch (error) {
    console.error('Failed to load master members:', error);
    Swal.fire({
      icon: 'error',
      title: 'Data Load Error',
      text: 'Could not load master_members.json file.'
    });
  }
}

// Local Storage Management
function loadSavedRegistrations() {
  const data = localStorage.getItem(STORAGE_KEY);
  savedRegistrations = data ? JSON.parse(data) : [];
}

function saveRegistrationsToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(savedRegistrations));
  document.getElementById('totalSavedCount').textContent = `${savedRegistrations.length} Records Saved`;
}

// Audio Playback Helper
function playSound(soundFileName) {
  const audio = new Audio(`sounds/${soundFileName}`);
  audio.play().catch((err) => console.log('Audio playback prevented/failed:', err));
}

// View Switches
function showRegistrationView() {
  document.getElementById('registrationView').style.display = 'block';
  document.getElementById('dashboardSection').style.display = 'none';
  startScanner();
}

function showDashboardView() {
  document.getElementById('registrationView').style.display = 'none';
  document.getElementById('dashboardSection').style.display = 'flex';
  stopScanner();
}

function swalPorridgeInfo() {
  Swal.fire({
    title: 'Issue Porridge',
    text: 'Porridge distribution tracking module is active.',
    icon: 'info'
  });
}

// Scanner Operations using html5-qrcode
function startScanner() {
  if (isScannerActive) return;

  html5QrcodeScanner = new Html5Qrcode("qr-reader");
  const config = { fps: 10, qrbox: { width: 250, height: 250 } };

  html5QrcodeScanner.start(
    { facingMode: "environment" },
    config,
    onScanSuccess
  ).then(() => {
    isScannerActive = true;
    updateScannerBtnUI(true);
  }).catch((err) => {
    console.warn("Unable to start scanner automatically:", err);
    isScannerActive = false;
    updateScannerBtnUI(false);
  });
}

function stopScanner() {
  if (html5QrcodeScanner && isScannerActive) {
    html5QrcodeScanner.stop().then(() => {
      isScannerActive = false;
      updateScannerBtnUI(false);
    }).catch(err => console.error("Error stopping scanner:", err));
  }
}

function toggleCamera() {
  if (isScannerActive) {
    stopScanner();
  } else {
    startScanner();
  }
}

function updateScannerBtnUI(active) {
  const btn = document.getElementById('toggleCameraBtn');
  if (!btn) return;
  if (active) {
    btn.innerHTML = `<i class="fa-solid fa-pause me-1"></i> Pause Scanner`;
    btn.className = "btn btn-outline-warning btn-sm rounded-pill";
  } else {
    btn.innerHTML = `<i class="fa-solid fa-play me-1"></i> Start Scanner`;
    btn.className = "btn btn-outline-primary btn-sm rounded-pill";
  }
}

// Scanning and Validation Handler
function onScanSuccess(decodedText) {
  stopScanner(); // Pause scanner immediately after detection
  processMemberId(decodedText.trim());
}

function handleManualSubmit() {
  const input = document.getElementById('manualIdInput');
  const val = input.value.trim();
  if (!val) {
    Swal.fire('Warning', 'Please enter a valid Membership ID', 'warning');
    return;
  }
  stopScanner();
  processMemberId(val);
  input.value = '';
}

function processMemberId(memberId) {
  // Check Duplicate Registration
  const existingRecord = savedRegistrations.find(item => item.id.toLowerCase() === memberId.toLowerCase());
  if (existingRecord) {
    playSound('scan_duplicate.mp3');
    Swal.fire({
      icon: 'warning',
      title: 'Already Scanned Card!',
      html: `
        <div class="text-start">
          <p><strong>ID:</strong> ${existingRecord.id}</p>
          <p><strong>Name:</strong> ${existingRecord.name}</p>
          <p><strong>Family Count:</strong> ${existingRecord.familyCount}</p>
          <p><strong>Scanned At:</strong> ${existingRecord.timestamp}</p>
        </div>
      `,
      confirmButtonText: 'OK'
    }).then(() => {
      startScanner();
    });
    return;
  }

  // Lookup in Master JSON
  const matchedMember = masterMembers.find(item => item.id.toLowerCase() === memberId.toLowerCase());
  if (!matchedMember) {
    playSound('scan_warning.mp3');
    Swal.fire({
      icon: 'error',
      title: 'Member Not Found',
      text: `No master record found matching ID: ${memberId}`,
      confirmButtonText: 'Try Again'
    }).then(() => {
      startScanner();
    });
    return;
  }

  // Member Found - Open Family Selection Modal
  currentEditingMember = { ...matchedMember, isEditMode: false };
  openMemberModal(matchedMember.id, matchedMember.name);
}

// Modal Actions & Family Count Grid
function initFamilyCountButtons() {
  const container = document.getElementById('familyCountButtons');
  container.innerHTML = '';
  for (let i = 1; i <= 12; i++) {
    const col = document.createElement('div');
    col.className = 'col-3 col-sm-2';
    col.innerHTML = `
      <button class="btn btn-outline-primary badge-count w-100 d-flex align-items-center justify-content-center" 
              onclick="selectFamilyCount(${i})">
        ${i}
      </button>
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
  startScanner();
}

function selectFamilyCount(count) {
  playSound(`${count}.mp3`);

  const now = new Date();
  const timestampStr = now.toLocaleDateString() + ' ' + now.toLocaleTimeString();

  if (currentEditingMember.isEditMode) {
    // Update existing record
    const idx = savedRegistrations.findIndex(r => r.id === currentEditingMember.id);
    if (idx !== -1) {
      savedRegistrations[idx].familyCount = count;
      savedRegistrations[idx].timestamp = timestampStr;
    }
  } else {
    // Add new record
    savedRegistrations.unshift({
      id: currentEditingMember.id,
      name: currentEditingMember.name,
      familyCount: count,
      timestamp: timestampStr
    });
  }

  saveRegistrationsToStorage();
  renderSavedTable();

  const modalEl = bootstrap.Modal.getInstance(document.getElementById('memberModal'));
  if (modalEl) modalEl.hide();

  currentEditingMember = null;
  startScanner();
}

// Datatable Initialization & Render Functions
function initDataTable() {
  if ($.fn.DataTable.isDataTable('#membersTable')) {
    $('#membersTable').DataTable().destroy();
  }
  dataTableInstance = $('#membersTable').DataTable({
    responsive: true,
    paging: false,
    info: false,
    searching: true,
    order: []
  });
}

function renderSavedTable() {
  const tbody = document.getElementById('membersTableBody');
  tbody.innerHTML = '';

  const displayList = showAllRecords ? savedRegistrations : savedRegistrations.slice(0, 25);

  displayList.forEach((item) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="fw-bold">${escapeHtml(item.id)}</td>
      <td>${escapeHtml(item.name)}</td>
      <td class="text-center"><span class="badge bg-primary rounded-pill px-3 py-2">${item.familyCount}</span></td>
      <td><small class="text-muted">${item.timestamp}</small></td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-secondary me-1" onclick="editRecord('${item.id}')" title="Edit">
          <i class="fa-solid fa-pen-to-square"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteRecord('${item.id}')" title="Delete">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('totalSavedCount').textContent = `${savedRegistrations.length} Records Saved`;
}

function toggleRecordViewLimit() {
  showAllRecords = !showAllRecords;
  const subtitle = document.getElementById('tableSubtitle');

  if (showAllRecords) {
    subtitle.textContent = `Displaying all ${savedRegistrations.length} records`;
  } else {
    subtitle.textContent = `Displaying recent 25 records`;
  }
  renderSavedTable();
}

// Record Action Handlers (Edit & Delete)
function editRecord(id) {
  stopScanner();
  const record = savedRegistrations.find(r => r.id === id);
  if (!record) return;

  currentEditingMember = { ...record, isEditMode: true };
  openMemberModal(record.id, record.name);
}

function deleteRecord(id) {
  const record = savedRegistrations.find(r => r.id === id);
  if (!record) return;

  Swal.fire({
    title: 'Confirm Deletion',
    html: `Are you sure you want to delete this record?<br><br><strong>ID:</strong> ${record.id}<br><strong>Name:</strong> ${record.name}`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc3545',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'Delete Record'
  }).then((result) => {
    if (result.isConfirmed) {
      savedRegistrations = savedRegistrations.filter(r => r.id !== id);
      saveRegistrationsToStorage();
      renderSavedTable();
      Swal.fire('Deleted!', 'Record removed from local storage.', 'success');
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
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'Yes, Wipe Everything'
  }).then((result) => {
    if (result.isConfirmed) {
      savedRegistrations = [];
      localStorage.removeItem(STORAGE_KEY);
      renderSavedTable();
      Swal.fire('Reset Complete', 'Local storage wiped successfully.', 'info');
    }
  });
}

// Export Table Data to Excel File
function exportToExcel() {
  if (savedRegistrations.length === 0) {
    Swal.fire('No Data', 'There are no records available to export.', 'info');
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

  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `TJM_Ramadan_Registrations_${today}.xlsx`);
}

// Security Helper Utility
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
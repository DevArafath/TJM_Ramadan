let masterMembers = [];
let scanner = null;
let scannerRunning = false;
let currentMember = null;
let editingRecordId = null;
let modalInstance = null;
let dataTable = null;
let scanProcessing = false;

const $ = id => document.getElementById(id);

document.addEventListener("DOMContentLoaded", async () => {
  modalInstance = new bootstrap.Modal($("memberModal"));
  buildCountButtons();
  bindEvents();
  renderRecords();

  try {
    masterMembers = await TJM.getMembers();
    if (!masterMembers.length) throw new Error("No members");
    startScanner();
  } catch (error) {
    Swal.fire({
      icon: "warning",
      title: "Master list unavailable",
      text: "The master member list could not be loaded. You can still use the manual field after checking your connection."
    });
  }
});

function bindEvents() {
  $("manualSearch").addEventListener("click", () => handleMemberId($("manualId").value));
  $("manualId").addEventListener("keydown", e => {
    if (e.key === "Enter") handleMemberId(e.target.value);
  });

  $("modalClose").addEventListener("click", closeMemberModal);
  $("exportBtn").addEventListener("click", exportExcel);
  $("resetBtn").addEventListener("click", resetAll);

  $("recordsTable").addEventListener("click", e => {
    const button = e.target.closest("[data-action]");
    if (!button) return;
    const id = button.dataset.id;
    if (button.dataset.action === "delete") deleteRecord(id);
    if (button.dataset.action === "edit") editRecord(id);
  });
}

function buildCountButtons() {
  const grid = $("countGrid");
  for (let i = 1; i <= 12; i++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "count-btn";
    btn.textContent = i;
    btn.dataset.count = i;
    btn.addEventListener("click", () => saveCount(i));
    grid.appendChild(btn);
  }
}

async function startScanner() {
  if (scannerRunning || !window.Html5Qrcode) return;

  scanner = scanner || new Html5Qrcode("reader");

  try {
    await scanner.start(
      { facingMode: "environment" },
      {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1
      },
      decodedText => {
        handleMemberId(decodedText);
      },
      () => {}
    );
    scannerRunning = true;
  } catch (error) {
    console.warn("Camera scanner could not start:", error);
    scannerRunning = false;
  }
}

async function stopScanner() {
  if (!scanner || !scannerRunning) return;
  try {
    await scanner.stop();
    scannerRunning = false;
  } catch (error) {
    console.warn("Scanner stop error:", error);
  }
}

async function restartScanner() {
  if (!scannerRunning) await startScanner();
}

async function handleMemberId(rawId) {
  const id = String(rawId || "").trim();
  if (!id || scanProcessing) return;
  scanProcessing = true;

  await stopScanner();

  const member = TJM.findMember(masterMembers, id);

  if (!member) {
    TJM.playSound("scan_warning.mp3");
    await Swal.fire({
      icon: "warning",
      title: "Member Not Found",
      html: `<div class="small text-secondary">Membership number</div>
             <div class="fw-bold mt-1">${escapeHtml(id)}</div>
             <p class="small mt-3 mb-0">This number was not found in the master member list.</p>`,
      confirmButtonColor: "#0f5132"
    });
    await restartScanner();
    scanProcessing = false;
    return;
  }

  const records = TJM.getRecords();
  const duplicate = records.find(r => r.memberId.toLowerCase() === member.id.toLowerCase());

  if (duplicate && editingRecordId !== duplicate.recordKey) {
    TJM.playSound("scan_duplicate.mp3");
    await Swal.fire({
      icon: "warning",
      title: "Already Registered",
      html: `
        <div class="text-start">
          <div class="fw-bold">${escapeHtml(duplicate.name)}</div>
          <div class="small text-secondary">${escapeHtml(duplicate.memberId)}</div>
          <hr>
          <div><strong>Family Members:</strong> ${duplicate.familyCount}</div>
          <div><strong>Scanned:</strong> ${escapeHtml(TJM.formatDateTime(duplicate.createdAt))}</div>
        </div>`,
      confirmButtonColor: "#0f5132"
    });
    await restartScanner();
    scanProcessing = false;
    return;
  }

  currentMember = member;
  $("modalName").textContent = member.name;
  $("modalId").textContent = member.id;

  document.querySelectorAll(".count-btn").forEach(btn => {
    btn.classList.toggle("active", Number(btn.dataset.count) === Number(
      duplicate?.familyCount || 0
    ));
  });

  modalInstance.show();
}

function saveCount(count) {
  if (!currentMember) return;

  const records = TJM.getRecords();

  if (editingRecordId) {
    const index = records.findIndex(r => r.recordKey === editingRecordId);
    if (index !== -1) {
      records[index].familyCount = count;
      records[index].updatedAt = new Date().toISOString();
      TJM.saveRecords(records);
      TJM.playSound(`${count}.mp3`);
      closeMemberModal();
      renderRecords();

      Swal.fire({
        icon: "success",
        title: "Updated",
        text: "Family member count updated successfully.",
        timer: 1300,
        showConfirmButton: false
      });
      return;
    }
  }

  records.push({
    recordKey: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    memberId: currentMember.id,
    name: currentMember.name,
    familyCount: count,
    createdAt: new Date().toISOString()
  });

  TJM.saveRecords(records);
  TJM.playSound(`${count}.mp3`);

  closeMemberModal();
  renderRecords();

  Swal.fire({
    icon: "success",
    title: "Registered",
    html: `<strong>${escapeHtml(currentMember.name)}</strong><br>
           <span class="text-secondary">${escapeHtml(currentMember.id)}</span><br><br>
           Family members: <strong>${count}</strong>`,
    timer: 1700,
    showConfirmButton: false
  });
}

function closeMemberModal() {
  modalInstance.hide();
  currentMember = null;
  editingRecordId = null;
  $("manualId").value = "";
  setTimeout(async () => {
    await restartScanner();
    scanProcessing = false;
  }, 350);
}

function renderRecords() {
  const all = TJM.getRecords().sort((a,b) =>
    new Date(b.createdAt) - new Date(a.createdAt)
  );
  const recent = all.slice(0, 25);
  const tbody = $("recordsTable").querySelector("tbody");
  tbody.innerHTML = "";

  recent.forEach(record => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <div class="fw-bold">${escapeHtml(record.name)}</div>
        <div class="small text-secondary">${escapeHtml(record.memberId)}</div>
      </td>
      <td><span class="badge-family">${record.familyCount}</span></td>
      <td class="small text-secondary">${escapeHtml(TJM.formatDateTime(record.createdAt))}</td>
      <td class="text-end text-nowrap">
        <button class="icon-btn me-1" title="Edit" data-action="edit" data-id="${record.recordKey}">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button class="icon-btn" title="Delete" data-action="delete" data-id="${record.recordKey}">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>`;
    tbody.appendChild(tr);
  });

  $("emptyState").classList.toggle("d-none", recent.length !== 0);

  if (dataTable) dataTable.destroy();
  dataTable = new DataTable("#recordsTable", {
    searching: false,
    paging: false,
    info: false,
    ordering: false,
    language: { emptyTable: "No registrations yet" }
  });
}

function editRecord(recordKey) {
  const record = TJM.getRecords().find(r => r.recordKey === recordKey);
  if (!record) return;

  const member = TJM.findMember(masterMembers, record.memberId);
  if (!member) {
    Swal.fire("Unavailable", "This member is no longer present in the master list.", "warning");
    return;
  }

  editingRecordId = recordKey;
  currentMember = member;
  $("modalName").textContent = member.name;
  $("modalId").textContent = member.id;

  document.querySelectorAll(".count-btn").forEach(btn => {
    btn.classList.toggle("active", Number(btn.dataset.count) === Number(record.familyCount));
  });

  stopScanner();
  modalInstance.show();
}

async function deleteRecord(recordKey) {
  const records = TJM.getRecords();
  const record = records.find(r => r.recordKey === recordKey);
  if (!record) return;

  const result = await Swal.fire({
    icon: "warning",
    title: "Delete Registration?",
    html: `
      <div class="text-start">
        <div class="fw-bold">${escapeHtml(record.name)}</div>
        <div class="small text-secondary">${escapeHtml(record.memberId)}</div>
        <hr>
        <div>Family members: <strong>${record.familyCount}</strong></div>
        <div>Registered: <strong>${escapeHtml(TJM.formatDateTime(record.createdAt))}</strong></div>
      </div>`,
    showCancelButton: true,
    confirmButtonText: "Delete",
    cancelButtonText: "Cancel",
    confirmButtonColor: "#dc3545"
  });

  if (!result.isConfirmed) return;

  TJM.saveRecords(records.filter(r => r.recordKey !== recordKey));
  renderRecords();

  Swal.fire({
    icon: "success",
    title: "Deleted",
    timer: 1100,
    showConfirmButton: false
  });
}

async function resetAll() {
  const records = TJM.getRecords();
  if (!records.length) {
    Swal.fire("Nothing to Reset", "There are no saved registrations on this device.", "info");
    return;
  }

  const result = await Swal.fire({
    icon: "warning",
    title: "Reset All Registration Data?",
    html: `<strong>${records.length}</strong> saved registration(s) will be permanently removed from this device.`,
    showCancelButton: true,
    confirmButtonText: "Yes, Reset Everything",
    cancelButtonText: "Cancel",
    confirmButtonColor: "#dc3545"
  });

  if (!result.isConfirmed) return;

  localStorage.removeItem(TJM.STORAGE_KEY);
  renderRecords();

  Swal.fire({
    icon: "success",
    title: "Data Reset",
    text: "All local registration records have been removed.",
    timer: 1400,
    showConfirmButton: false
  });
}

function exportExcel() {
  const records = TJM.getRecords().sort((a,b) =>
    new Date(a.createdAt) - new Date(b.createdAt)
  );

  if (!records.length) {
    Swal.fire("No Data", "There are no registration records to export.", "info");
    return;
  }

  const rows = records.map((r, index) => ({
    "No.": index + 1,
    "Membership No.": r.memberId,
    "Member Name": r.name,
    "Family Members": r.familyCount,
    "Registered Date": new Intl.DateTimeFormat("en-GB", {
      day: "2-digit", month: "2-digit", year: "numeric"
    }).format(new Date(r.createdAt)),
    "Registered Time": new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true
    }).format(new Date(r.createdAt))
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet["!cols"] = [
    { wch: 7 }, { wch: 20 }, { wch: 38 },
    { wch: 17 }, { wch: 18 }, { wch: 18 }
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Registrations");

  const stamp = new Date().toISOString().slice(0,10);
  XLSX.writeFile(workbook, `TJM_Ramadan_Registrations_${stamp}.xlsx`);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));
}
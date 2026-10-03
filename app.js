(() => {
  const KEY = 'tjm_members';
  const $ = s => document.querySelector(s);
  let members = [], scanner = null, scanning = false, busy = false, editing = null, showAll = false, table = null;

  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
  const save = d => localStorage.setItem(KEY, JSON.stringify(d));
  const fmt = iso => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const play = n => { try { new Audio(`sounds/${n}.mp3`).play().catch(() => {}); } catch {} };

  function route() {
    const v = (location.hash || '#home').slice(1);
    document.querySelectorAll('.view').forEach(e => e.classList.add('d-none'));
    ($('#view-' + v) || $('#view-home')).classList.remove('d-none');
    if (v !== 'register') stopScanner();
    if (v === 'register') render();
  }
  window.addEventListener('hashchange', route);

  async function loadMaster() {
    try { members = await (await fetch('master_members.json', { cache: 'no-cache' })).json(); }
    catch { Swal.fire('Error', 'Could not load master_members.json', 'error'); }
  }

  async function startScanner() {
    if (scanning || busy) return;
    try {
      scanner = scanner || new Html5Qrcode('reader');
      await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 230, height: 230 } }, onScan, () => {});
      scanning = true; updateToggle();
    } catch (e) { scanning = false; updateToggle(); Swal.fire('Camera error', 'Unable to access the camera. Use manual entry instead.', 'warning'); }
  }
  async function stopScanner() {
    if (scanner && scanning) { try { await scanner.stop(); } catch {} }
    scanning = false; updateToggle();
  }
  function updateToggle() {
    $('#scanToggle').innerHTML = scanning
      ? '<i class="fa-solid fa-stop me-1"></i>Stop Scanner' : '<i class="fa-solid fa-camera me-1"></i>Start Scanner';
    $('#scanToggle').className = 'btn flex-fill ' + (scanning ? 'btn-danger' : 'btn-success');
  }
  function resume() { busy = false; if (!$('#view-register').classList.contains('d-none')) startScanner(); }

  async function onScan(text) { if (!busy) await handleId(text); }

  async function handleId(raw) {
    const id = String(raw).trim().toUpperCase();
    if (!id || busy) return;
    busy = true;
    await stopScanner();   // stop scanning while details are handled
    const existing = load().find(r => r.id.toUpperCase() === id);
    if (existing) {
      play('scan_duplicate');
      await Swal.fire({ icon: 'info', title: 'Already Scanned',
        html: `<b>${esc(existing.id)}</b><br>${esc(existing.name)}<br>Family members: <b>${existing.count}</b><br><small>Scanned: ${fmt(existing.time)}</small>` });
      return resume();
    }
    const m = members.find(x => x.id.toUpperCase() === id);
    if (!m) {
      play('scan_warning');
      await Swal.fire({ icon: 'warning', title: 'Member Not Found', html: `<b>${esc(id)}</b><br>is not in the master list.` });
      return resume();
    }
    openModal(m, null);
  }

  const modal = new bootstrap.Modal('#countModal');
  const grid = $('#countGrid');
  for (let i = 1; i <= 12; i++) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = i; b.dataset.n = i; grid.appendChild(b);
  }
  function openModal(m, rec) {
    editing = rec ? rec.id : null;
    $('#modalTitle').textContent = rec ? 'Edit Family Count' : 'Member Found';
    $('#mId').textContent = m.id; $('#mName').textContent = m.name;
    grid.querySelectorAll('button').forEach(b => b.classList.toggle('active', !!rec && +b.dataset.n === rec.count));
    modal._m = m; modal.show();
  }
  grid.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const n = +b.dataset.n, m = modal._m, data = load();
    play(n);
    if (editing) { const r = data.find(x => x.id === editing); if (r) r.count = n; }
    else data.push({ id: m.id, name: m.name, count: n, time: new Date().toISOString() });
    save(data); modal.hide(); render();
    Swal.fire({ icon: 'success', title: 'Saved', text: `${m.name} – ${n} member(s)`, timer: 1200, showConfirmButton: false }).then(resume);
  });
  $('#modalClose').addEventListener('click', () => { modal.hide(); resume(); });

  function render() {
    const data = load().slice().reverse();
    $('#totalBadge').textContent = data.length;
    const rows = showAll ? data : data.slice(0, 25);
    if (table) { table.destroy(); table = null; }
    $('#recTable tbody').innerHTML = rows.map((r, i) => `
      <tr><td>${data.length - i}</td><td>${esc(r.id)}</td><td class="name">${esc(r.name)}</td>
      <td><span class="badge bg-success">${r.count}</span></td><td>${fmt(r.time)}</td>
      <td><button class="act-btn edit" data-id="${esc(r.id)}" title="Edit"><i class="fa-solid fa-pen-to-square"></i></button>
      <button class="act-btn del" data-id="${esc(r.id)}" title="Delete"><i class="fa-solid fa-trash"></i></button></td></tr>`).join('');
    table = new DataTable('#recTable', { order: [], pageLength: 10, columnDefs: [{ orderable: false, targets: 5 }] });
    const t = $('#toggleAll');
    t.style.display = data.length > 25 ? '' : 'none';
    t.textContent = showAll ? 'Show recent 25 only' : `Show all ${data.length} records`;
  }
  $('#toggleAll').addEventListener('click', e => { e.preventDefault(); showAll = !showAll; render(); });

  $('#recTable').addEventListener('click', async e => {
    const b = e.target.closest('.act-btn'); if (!b) return;
    const data = load(), r = data.find(x => x.id === b.dataset.id); if (!r) return;
    if (b.classList.contains('edit')) { busy = true; await stopScanner(); openModal(r, r); return; }
    const res = await Swal.fire({ icon: 'warning', title: 'Delete record?',
      html: `<b>${esc(r.id)}</b><br>${esc(r.name)}<br>Family members: ${r.count}`,
      showCancelButton: true, confirmButtonColor: '#dc3545', confirmButtonText: 'Yes, delete' });
    if (res.isConfirmed) { save(data.filter(x => x.id !== r.id)); render(); }
  });

  $('#exportBtn').addEventListener('click', () => {
    const data = load();
    if (!data.length) return Swal.fire('No data', 'There are no records to export.', 'info');
    const ws = XLSX.utils.json_to_sheet(data.map((r, i) => ({
      '#': i + 1, 'Membership No': r.id, 'Name': r.name, 'Family Members': r.count, 'Scanned At': fmt(r.time) })));
    ws['!cols'] = [{ wch: 5 }, { wch: 16 }, { wch: 36 }, { wch: 15 }, { wch: 22 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Members');
    XLSX.writeFile(wb, `TJM_Ramadan_${new Date().toISOString().slice(0, 10)}.xlsx`);
  });
  $('#resetBtn').addEventListener('click', async () => {
    const res = await Swal.fire({ icon: 'warning', title: 'Reset everything?',
      text: 'This permanently deletes all saved records from this device.',
      showCancelButton: true, confirmButtonColor: '#dc3545', confirmButtonText: 'Yes, reset' });
    if (res.isConfirmed) { localStorage.clear(); render(); Swal.fire({ icon: 'success', title: 'Reset complete', timer: 1200, showConfirmButton: false }); }
  });

  $('#scanToggle').addEventListener('click', () => scanning ? stopScanner() : startScanner());
  const manual = () => { const v = $('#manualId').value; $('#manualId').value = ''; handleId(v); };
  $('#manualBtn').addEventListener('click', manual);
  $('#manualId').addEventListener('keydown', e => { if (e.key === 'Enter') manual(); });

  let deferred;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; $('#installBtn').classList.remove('d-none'); });
  $('#installBtn').addEventListener('click', async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $('#installBtn').classList.add('d-none'); });
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('service-worker.js'));

  loadMaster().then(route);
})();

// ============================================================
// guru-paket.js — v18.23 (redesign total)
// ============================================================

var paketCache = [];
var paketFilterState = { search: '', mapel: 'all', sort: 'newest' };
var currentBuatPaketTab = 'csv';
var currentJsonMode = 'paste';
var parsedJSONCache = null;

// ============ LOAD & RENDER ============

async function loadPaket() {
  try {
    var r = await fetch('/api/teacher/paket');
    paketCache = await r.json();
    updatePaketStats();
    updateMapelFilter();
    updatePaketDropdown();
    renderPaketList();
  } catch (e) { console.error('loadPaket:', e); }
}

function updatePaketStats() {
  var el = document.getElementById('paketStats');
  if (!el) return;
  var total = paketCache.length;
  var totalSoal = paketCache.reduce(function(sum, p) { return sum + (p.jumlahSoal || 0); }, 0);
  var latihanOn = paketCache.filter(function(p) { return p.latihanMandiri; }).length;
  var parts = [];
  if (total > 0) parts.push(total + ' paket');
  if (totalSoal > 0) parts.push(totalSoal + ' soal');
  if (latihanOn > 0) parts.push(latihanOn + ' aktif latihan');
  el.textContent = parts.join(' · ') || 'Belum ada paket soal';
}

function updateMapelFilter() {
  var sel = document.getElementById('paketMapelFilter');
  if (!sel) return;
  var mapels = [];
  paketCache.forEach(function(p) { if (p.mapel && mapels.indexOf(p.mapel) === -1) mapels.push(p.mapel); });
  mapels.sort();
  var current = sel.value;
  var html = '<option value="all">Semua Mapel</option>';
  mapels.forEach(function(m) { html += '<option value="' + escapeHtml(m) + '">' + escapeHtml(m) + '</option>'; });
  sel.innerHTML = html;
  if (mapels.indexOf(current) !== -1 || current === 'all') sel.value = current;
}

function updatePaketDropdown() {
  var sel = document.getElementById('paketSelect');
  if (!sel) return;
  if (!paketCache.length) {
    sel.innerHTML = '<option value="">(Belum ada paket)</option>';
    return;
  }
  sel.innerHTML = paketCache.map(function(p) {
    return '<option value="' + p.id + '">' + escapeHtml(p.judul) + ' — ' + escapeHtml(p.mapel) + ' (' + p.jumlahSoal + ' soal / ' + p.durasiMenit + ' mnt)</option>';
  }).join('');
}

function onPaketFilterChange() {
  paketFilterState.search = (document.getElementById('paketSearch') || {}).value || '';
  paketFilterState.search = paketFilterState.search.toLowerCase().trim();
  paketFilterState.mapel = (document.getElementById('paketMapelFilter') || {}).value || 'all';
  paketFilterState.sort = (document.getElementById('paketSort') || {}).value || 'newest';
  renderPaketList();
}

function resetPaketFilter() {
  var s = document.getElementById('paketSearch'); if (s) s.value = '';
  var m = document.getElementById('paketMapelFilter'); if (m) m.value = 'all';
  var so = document.getElementById('paketSort'); if (so) so.value = 'newest';
  onPaketFilterChange();
}

function filterPaket(list) {
  var out = list.slice();
  if (paketFilterState.search) {
    out = out.filter(function(p) {
      return (p.judul || '').toLowerCase().indexOf(paketFilterState.search) !== -1
        || (p.mapel || '').toLowerCase().indexOf(paketFilterState.search) !== -1;
    });
  }
  if (paketFilterState.mapel !== 'all') {
    out = out.filter(function(p) { return p.mapel === paketFilterState.mapel; });
  }
  var sort = paketFilterState.sort;
  if (sort === 'newest') out.sort(function(a, b) { return (b.created_at || 0) - (a.created_at || 0); });
  else if (sort === 'oldest') out.sort(function(a, b) { return (a.created_at || 0) - (b.created_at || 0); });
  else if (sort === 'az') out.sort(function(a, b) { return (a.judul || '').localeCompare(b.judul || ''); });
  else if (sort === 'za') out.sort(function(a, b) { return (b.judul || '').localeCompare(a.judul || ''); });
  else if (sort === 'soal-desc') out.sort(function(a, b) { return (b.jumlahSoal || 0) - (a.jumlahSoal || 0); });
  return out;
}

function renderPaketList() {
  var c = document.getElementById('paketListContainer');
  if (!c) return;
  if (!paketCache.length) { c.innerHTML = renderPaketEmptyState(); return; }
  var filtered = filterPaket(paketCache);
  if (!filtered.length) {
    c.innerHTML = '<div class="paket-empty"><div class="paket-empty-icon">🔍</div><h3>Tidak ada paket yang cocok</h3><p>Coba ubah kata kunci atau filter.</p><button class="btn btn-secondary" onclick="resetPaketFilter()">Reset Filter</button></div>';
    return;
  }
  c.innerHTML = filtered.map(renderPaketItem).join('');
}

function renderPaketItem(p) {
  var emoji = mapelEmoji(p.mapel);
  var isNew = p.created_at && (Date.now() - p.created_at) < 7 * 24 * 3600 * 1000;
  var dateStr = p.created_at ? formatRelativeDate(p.created_at) : '';
  var badges = '';
  if (isNew) badges += '<span class="paket-badge paket-badge-new">Terbaru</span>';
  if (p.latihanMandiri) badges += '<span class="paket-badge paket-badge-latihan">Latihan ON</span>';
  var startDisabled = p.jumlahSoal === 0;
  var startBtn = startDisabled
    ? '<button class="btn paket-btn-start" disabled title="Paket belum punya soal"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> Mulai Ujian</button>'
    : '<button class="btn paket-btn-start" onclick="mulaiPaket(\'' + p.id + '\')" title="Mulai ujian"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> Mulai Ujian</button>';

  return '<div class="paket-item" data-id="' + p.id + '">' +
    '<div class="paket-item-icon">' + emoji + '</div>' +
    '<div class="paket-item-content">' +
      '<div class="paket-item-title-row">' +
        '<h3 class="paket-item-title">' + escapeHtml(p.judul) + '</h3>' + badges +
      '</div>' +
      '<div class="paket-item-meta">' +
        '<span class="paket-item-mapel">' + escapeHtml(p.mapel) + '</span>' +
        '<span class="paket-meta-sep">·</span>' +
        '<span>' + p.jumlahSoal + ' soal</span>' +
        '<span class="paket-meta-sep">·</span>' +
        '<span>' + p.durasiMenit + ' menit</span>' +
        (dateStr ? '<span class="paket-meta-sep">·</span><span class="muted">' + dateStr + '</span>' : '') +
      '</div>' +
    '</div>' +
    '<div class="paket-item-actions">' + startBtn +
      '<button class="btn paket-btn-preview" onclick="previewPaketById(\'' + p.id + '\')">Preview</button>' +
      '<button class="btn paket-btn-edit" onclick="bukaEditor(\'' + p.id + '\')" title="Edit paket"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> Edit</button>' +
      '<div class="paket-menu-wrap"><button class="btn-icon paket-menu-btn" onclick="togglePaketMenu(event, \'' + p.id + '\')" title="Aksi lainnya">⋯</button>' +
        '<div class="paket-menu" id="paketMenu-' + p.id + '">' +
          
          '<button onclick="toggleLatihan(\'' + p.id + '\', ' + (p.latihanMandiri ? 'true' : 'false') + ')">' + (p.latihanMandiri ? '🎓 Matikan Latihan' : '🎓 Aktifkan Latihan') + '</button>' +
          '<button onclick="duplikatPaketById(\'' + p.id + '\')">📋 Duplikat</button>' +
          '<div class="paket-menu-divider"></div>' +
          '<button onclick="exportPaketCsvById(\'' + p.id + '\')">📤 Export CSV</button>' +
          '<button onclick="exportPaketJsonById(\'' + p.id + '\')">📤 Export JSON</button>' +
          '<div class="paket-menu-divider"></div>' +
          '<button class="danger" onclick="hapusPaketById(\'' + p.id + '\')">🗑 Hapus</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function renderPaketEmptyState() {
  return '<div class="paket-empty">' +
    '<div class="paket-empty-icon">📦</div>' +
    '<h3>Belum Ada Paket Soal</h3>' +
    '<p>Mulai dengan salah satu dari 3 cara:</p>' +
    '<div class="paket-empty-actions">' +
      '<button class="paket-empty-btn" onclick="bukaModalBuatPaket(\'csv\')"><span class="paket-empty-emoji">📝</span><span><strong>Import CSV</strong><small>dari file Excel</small></span></button>' +
      '<button class="paket-empty-btn" onclick="bukaModalBuatPaket(\'json\')"><span class="paket-empty-emoji">🤖</span><span><strong>Import JSON</strong><small>dari TKA Studio</small></span></button>' +
      '<button class="paket-empty-btn" onclick="bukaModalBuatPaket(\'manual\')"><span class="paket-empty-emoji">✏️</span><span><strong>Buat Manual</strong><small>soal satu per satu</small></span></button>' +
    '</div>' +
  '</div>';
}

function mapelEmoji(mapel) {
  var m = (mapel || '').toLowerCase();
  if (m.indexOf('mat') !== -1) return '📐';
  if (m.indexOf('ipa') !== -1 || m.indexOf('fisika') !== -1 || m.indexOf('biologi') !== -1 || m.indexOf('kimia') !== -1) return '🔬';
  if (m.indexOf('b. indo') !== -1 || m.indexOf('bahasa indonesia') !== -1 || m.indexOf('indonesia') !== -1) return '📖';
  if (m.indexOf('inggris') !== -1 || m.indexOf('english') !== -1) return '🌍';
  if (m.indexOf('ips') !== -1 || m.indexOf('sejarah') !== -1 || m.indexOf('geografi') !== -1 || m.indexOf('ekonomi') !== -1) return '🗺️';
  if (m.indexOf('pai') !== -1 || m.indexOf('agama') !== -1) return '🕌';
  if (m.indexOf('pkn') !== -1 || m.indexOf('ppkn') !== -1 || m.indexOf('pancasila') !== -1) return '🇮🇩';
  if (m.indexOf('seni') !== -1) return '🎨';
  if (m.indexOf('pjok') !== -1 || m.indexOf('olahraga') !== -1) return '⚽';
  if (m.indexOf('informatika') !== -1 || m.indexOf('tik') !== -1) return '💻';
  return '📘';
}

function formatRelativeDate(ms) {
  if (!ms) return '';
  var diff = Date.now() - ms;
  var sec = Math.floor(diff / 1000);
  if (sec < 60) return 'baru saja';
  var min = Math.floor(sec / 60);
  if (min < 60) return min + ' menit lalu';
  var hr = Math.floor(min / 60);
  if (hr < 24) return hr + ' jam lalu';
  var day = Math.floor(hr / 24);
  if (day < 7) return day + ' hari lalu';
  var d = new Date(ms);
  var bulan = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  return d.getDate() + ' ' + bulan[d.getMonth()] + ' ' + d.getFullYear();
}

// ============ MENU DROPDOWN ============

function togglePaketMenu(e, id) {
  e.stopPropagation();
  var idSel = 'paketMenu-' + id;
  document.querySelectorAll('.paket-menu').forEach(function(m) {
    if (m.id !== idSel) m.classList.remove('open');
  });
  var menu = document.getElementById(idSel);
  if (menu) menu.classList.toggle('open');
}

document.addEventListener('click', function() {
  document.querySelectorAll('.paket-menu.open').forEach(function(m) { m.classList.remove('open'); });
});

// ============ AKSI PAKET ============

function mulaiPaket(id) {
  var sel = document.getElementById('paketSelect');
  if (sel) sel.value = id;
  startExam();
}

async function previewPaketById(id) {
  if (typeof swalLoading === 'function') swalLoading('Memuat paket...');
  try {
    var r = await fetch('/api/teacher/paket/' + id + '/preview');
    var data = await r.json();
    if (!r.ok) { if (Swal) Swal.close(); await swalError(data.error || 'Gagal'); return; }
    var items = data.soal.map(function(s, i) {
      var tipe = s.tipe || 'pg';
      var wacanaHtml = '';
      if (s.wacana) {
        wacanaHtml = '<div style="background:#f8fafc;border-left:3px solid #1e40af;border-radius:4px;padding:12px;margin-bottom:10px;text-align:left">';
        if (s.wacana_judul) wacanaHtml += '<div style="font-weight:700;margin-bottom:6px;color:#1e40af">' + escapeHtml(s.wacana_judul) + '</div>';
        wacanaHtml += '<div style="font-size:13px;line-height:1.6;color:#334155">' + escapeHtml(s.wacana).replace(/\n/g, '<br>') + '</div>';
        if (s.wacana_sumber) wacanaHtml += '<div style="font-size:11px;color:#64748b;margin-top:6px;font-style:italic">Sumber: ' + escapeHtml(s.wacana_sumber) + '</div>';
        wacanaHtml += '</div>';
      }
      var captionHtml = s.img_caption ? '<div style="text-align:center;font-size:12px;color:#64748b;font-style:italic;margin-top:-4px;margin-bottom:8px">' + escapeHtml(s.img_caption) + '</div>' : '';
      var imgHtml = s.img ? '<img src="/gambar/' + encodeURIComponent(s.img) + '" style="display:block;max-width:100%;max-height:200px;margin:8px auto;border-radius:4px">' + captionHtml : '';
      var body = '';
      if (tipe === 'bs') {
        body = '<table style="width:100%;border-collapse:collapse;margin:8px 0;border:1px solid #e2e8f0"><thead><tr style="background:#f1f5f9"><th style="padding:6px;text-align:left;font-size:12px">Pernyataan</th><th style="padding:6px;width:50px;text-align:center;font-size:12px">Kunci</th></tr></thead><tbody>';
        (s.pernyataan || []).forEach(function(p) {
          body += '<tr><td style="padding:6px;border-top:1px solid #e2e8f0;font-size:13px">' + escapeHtml(p.teks) + '</td><td style="padding:6px;border-top:1px solid #e2e8f0;text-align:center;font-weight:700">' + (p.key ? 'B' : 'S') + '</td></tr>';
        });
        body += '</tbody></table>';
      } else {
        var kunciArr = tipe === 'mcma' ? (Array.isArray(s.key) ? s.key : []) : [s.key];
        body = (s.options || []).map(function(o, idx) {
          var isK = kunciArr.indexOf(idx) !== -1;
          var oi = (s.optionImgs && s.optionImgs[idx]) ? '<img src="/gambar/' + encodeURIComponent(s.optionImgs[idx]) + '" style="display:block;max-width:100%;max-height:80px;margin-top:4px;border-radius:3px">' : '';
          return '<div style="padding:8px 12px;border-radius:4px;margin:4px 0;border:1px solid ' + (isK ? '#86efac' : '#e2e8f0') + ';background:' + (isK ? '#d1fae5' : '#f8fafc') + '"><b>' + String.fromCharCode(65 + idx) + '.</b> ' + escapeHtml(o || '') + (isK ? ' <b style="color:#047857">[KUNCI]</b>' : '') + oi + '</div>';
        }).join('');
      }
      var tipeBadge = tipe === 'mcma' ? '<span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:700">MCMA</span>' : tipe === 'bs' ? '<span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:700">B/S</span>' : '<span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:700">PG</span>';
      var pemb = s.pembahasan ? '<div style="margin-top:8px;padding:8px;background:#f1f5f9;border-radius:4px;font-size:12px"><b>Pembahasan:</b> ' + escapeHtml(s.pembahasan) + '</div>' : '';
      return '<div style="border:1px solid #e2e8f0;border-radius:4px;padding:12px;margin-bottom:10px;text-align:left">' + wacanaHtml + '<div style="margin-bottom:6px;font-size:13px"><b>' + (i + 1) + '.</b> ' + tipeBadge + ' ' + escapeHtml(s.q || '(kosong)') + '</div>' + imgHtml + body + pemb + '</div>';
    }).join('');
    Swal.fire({ title: escapeHtml(data.judul) + ' — ' + escapeHtml(data.mapel), html: '<div style="font-size:13px;color:#64748b;margin-bottom:12px">' + data.soal.length + ' soal / ' + data.durasiMenit + ' menit</div>' + items, width: '850px', showCloseButton: true, showConfirmButton: false, showCancelButton: true, cancelButtonText: 'Tutup', cancelButtonColor: '#64748b' });
  } catch (e) { if (Swal) Swal.close(); await swalError(e.message); }
}

async function duplikatPaketById(id) {
  var newId = await swalPrompt('ID paket baru:', id + '-copy');
  if (newId == null) return;
  newId = slugify(newId);
  if (!newId) { await swalError('ID tidak valid'); return; }
  var judul = await swalPrompt('Judul paket baru:', id + ' (salinan)');
  if (judul == null) return;
  var r = await fetch('/api/teacher/paket/' + id + '/duplikat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paketId: newId, judul: judul || newId })
  });
  var d = await r.json();
  if (!r.ok) { await swalError(d.error || 'Gagal'); return; }
  await swalSuccess('Paket "' + d.paketId + '" dibuat (' + d.jumlahSoal + ' soal)');
  await loadPaket();
}

function exportPaketCsvById(id) { window.open('/api/teacher/paket/' + id + '/export-csv', '_blank'); }

async function exportPaketJsonById(id) {
  try {
    var r = await fetch('/api/teacher/paket/' + id + '/preview');
    if (!r.ok) throw new Error('Paket tidak ditemukan');
    var data = await r.json();
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = data.id + '.json';
    a.click();
  } catch (e) { await swalError(e.message); }
}

async function hapusPaketById(id) {
  if (!await swalConfirm('Hapus paket "' + id + '"?', 'Hapus Paket')) return;
  var r = await fetch('/api/teacher/hapus-paket', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paketId: id })
  });
  var d = await r.json();
  if (!d.ok) { await swalError(d.error || 'Gagal'); return; }
  await swalSuccess('Paket dihapus');
  await loadPaket();
}

async function toggleLatihan(id, aktifSekarang) {
  var aktif = !aktifSekarang;
  try {
    var r = await fetch('/api/teacher/toggle-latihan', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paketId: id, aktif: aktif })
    });
    var d = await r.json();
    if (!d.ok) { await swalError(d.error || 'Gagal'); return; }
    await swalSuccess(aktif ? 'Latihan mandiri AKTIF' : 'Latihan mandiri DIMATIKAN');
    await loadPaket();
  } catch (e) { await swalError(e.message); }
}

// ============ MODAL BUAT PAKET ============

function bukaModalBuatPaket(tab) {
  var modal = document.getElementById('modalBuatPaket');
  if (!modal) return;
  modal.style.display = 'flex';
  // Reset CSV
  ['impPaketId','impJudul','impMapel'].forEach(function(id) { var e=document.getElementById(id); if(e) e.value=''; });
  var d = document.getElementById('impDurasi'); if (d) d.value = '15';
  var sp = document.getElementById('impSlugPreview'); if (sp) sp.textContent = 'ID final: (kosong)';
  var ci = document.getElementById('importInfo'); if (ci) ci.textContent = '';
  var cf = document.getElementById('csvFile'); if (cf) cf.value = '';
  // Reset manual
  ['manualId','manualJudul','manualMapel'].forEach(function(id) { var e=document.getElementById(id); if(e) e.value=''; });
  var dm = document.getElementById('manualDurasi'); if (dm) dm.value = '15';
  var spm = document.getElementById('manualSlugPreview'); if (spm) spm.textContent = 'ID final: (kosong)';
  var mi = document.getElementById('manualInfo'); if (mi) mi.textContent = '';
  // Reset JSON
  var jp = document.getElementById('jsonPasteArea'); if (jp) jp.value = '';
  var jf = document.getElementById('jsonFileInput'); if (jf) jf.value = '';
  var fn = document.getElementById('fileNameDisplay'); if (fn) fn.textContent = '';
  var jpv = document.getElementById('jsonPreview'); if (jpv) { jpv.style.display = 'none'; jpv.innerHTML = ''; }
  var je = document.getElementById('jsonError'); if (je) je.textContent = '';
  var bp = document.getElementById('btnProsesImport'); if (bp) bp.disabled = true;
  parsedJSONCache = null;
  switchJsonMode('paste');
  switchBuatPaketTab(tab || 'csv');
}

function tutupModalBuatPaket() {
  var m = document.getElementById('modalBuatPaket');
  if (m) m.style.display = 'none';
}

function switchBuatPaketTab(tab) {
  currentBuatPaketTab = tab;
  document.querySelectorAll('.paket-tab').forEach(function(b) {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  document.querySelectorAll('.paket-pane').forEach(function(p) {
    p.classList.toggle('active', p.id === 'paneBuatPaket-' + tab);
  });
}

function switchJsonMode(mode) {
  currentJsonMode = mode;
  var tabs = document.querySelectorAll('.paket-json-tab');
  if (tabs.length >= 2) {
    tabs[0].classList.toggle('active', mode === 'paste');
    tabs[1].classList.toggle('active', mode === 'upload');
  }
  var pm = document.getElementById('jsonPasteMode'); if (pm) pm.style.display = mode === 'paste' ? 'block' : 'none';
  var um = document.getElementById('jsonUploadMode'); if (um) um.style.display = mode === 'upload' ? 'block' : 'none';
}

function previewSlug() {
  var slug = slugify((document.getElementById('impPaketId') || {}).value || (document.getElementById('impJudul') || {}).value);
  var el = document.getElementById('impSlugPreview');
  if (el) el.textContent = 'ID final: ' + (slug || '(kosong)');
}

function previewManualSlug() {
  var slug = slugify((document.getElementById('manualId') || {}).value || (document.getElementById('manualJudul') || {}).value);
  var el = document.getElementById('manualSlugPreview');
  if (el) el.textContent = 'ID final: ' + (slug || '(kosong)');
}

function downloadTemplate() { window.open('/api/teacher/template-csv', '_blank'); }

async function buatPaketManual() {
  var idInput = (document.getElementById('manualId') || {}).value || '';
  var judulInput = (document.getElementById('manualJudul') || {}).value || '';
  idInput = idInput.trim(); judulInput = judulInput.trim();
  var paketId = slugify(idInput || judulInput);
  if (!paketId) { await swalError('ID atau judul wajib diisi'); return; }
  var info = document.getElementById('manualInfo');
  if (info) info.textContent = 'Membuat paket...';
  try {
    var r = await fetch('/api/teacher/paket/create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: paketId,
        judul: judulInput || paketId,
        mapel: ((document.getElementById('manualMapel') || {}).value || '').trim() || 'Campuran',
        durasiMenit: parseInt((document.getElementById('manualDurasi') || {}).value) || 15
      })
    });
    var d = await r.json();
    if (!r.ok) { if (info) info.textContent = '❌ ' + (d.error || 'Gagal'); return; }
    if (info) info.textContent = '✅ Paket dibuat. Membuka editor...';
    await loadPaket();
    tutupModalBuatPaket();
    setTimeout(function() { bukaEditor(d.paketId); }, 300);
  } catch (e) { if (info) info.textContent = '❌ ' + e.message; }
}

// ============ IMPORT CSV ============

async function importCSV() {
  var file = (document.getElementById('csvFile') || {}).files;
  file = file ? file[0] : null;
  var info = document.getElementById('importInfo');
  if (!file) { await swalInfo('Pilih file CSV dulu'); return; }
  var idInput = ((document.getElementById('impPaketId') || {}).value || '').trim();
  var judulInput = ((document.getElementById('impJudul') || {}).value || '').trim();
  if (!idInput && !judulInput) {
    var namaFile = file.name.replace(/\.csv$/i, '');
    idInput = namaFile;
    var ipI = document.getElementById('impPaketId'); if (ipI) ipI.value = namaFile;
    var ipJ = document.getElementById('impJudul'); if (ipJ) ipJ.value = namaFile;
    judulInput = namaFile;
  }
  var paketId = slugify(idInput || judulInput);
  if (!paketId) { await swalError('ID kosong'); return; }
  if (info) info.textContent = 'Membaca file...';
  var csv = await file.text();
  if (info) info.textContent = 'Mengimpor...';
  var r = await fetch('/api/teacher/import-csv', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      paketId: paketId, judul: judulInput || paketId,
      mapel: ((document.getElementById('impMapel') || {}).value || '').trim() || 'Campuran',
      durasiMenit: parseInt((document.getElementById('impDurasi') || {}).value) || 15,
      csv: csv
    })
  });
  var d = await r.json();
  if (!r.ok) { if (info) info.textContent = ''; await swalError(d.error || 'Gagal import'); return; }
  await swalSuccess('Paket "' + d.paketId + '" diimpor: ' + d.jumlahSoal + ' soal');
  await loadPaket();
  tutupModalBuatPaket();
}

// ============ IMPORT JSON ============

function validateJSONRealtime(text) {
  var errEl = document.getElementById('jsonError');
  var previewEl = document.getElementById('jsonPreview');
  var btn = document.getElementById('btnProsesImport');
  if (!text.trim()) { if(errEl) errEl.textContent=''; if(previewEl) previewEl.style.display='none'; if(btn) btn.disabled=true; parsedJSONCache=null; return; }
  try {
    var parsed = JSON.parse(text);
    var err = validateSchema(parsed);
    if (err) { if(errEl) errEl.textContent = '⚠️ ' + err; if(previewEl) previewEl.style.display='none'; if(btn) btn.disabled=true; parsedJSONCache=null; return; }
    parsedJSONCache = parsed;
    showPreview(parsed);
    if (errEl) errEl.textContent = '';
    if (btn) btn.disabled = false;
  } catch (e) {
    if(errEl) errEl.textContent = '❌ JSON tidak valid: ' + e.message;
    if(previewEl) previewEl.style.display='none';
    if(btn) btn.disabled=true;
    parsedJSONCache=null;
  }
}

function validateSchema(paket) {
  if (!paket || typeof paket !== 'object') return 'Bukan JSON object';
  if (!paket.id || !/^[a-z0-9-]+$/.test(paket.id)) return 'Field "id" wajib huruf kecil/angka/minus';
  if (!paket.judul || !paket.judul.trim()) return 'Field "judul" wajib';
  if (!paket.mapel || !paket.mapel.trim()) return 'Field "mapel" wajib';
  if (!Number.isFinite(paket.durasiMenit) || paket.durasiMenit <= 0) return 'Field "durasiMenit" wajib angka positif';
  if (!Array.isArray(paket.soal) || !paket.soal.length) return 'Field "soal" wajib array minimal 1';
  for (var i = 0; i < paket.soal.length; i++) {
    var s = paket.soal[i], no = i + 1;
    if (!s.id) return 'Soal #' + no + ': id wajib';
    var tipe = (s.tipe || '').toLowerCase();
    if (['pg','mcma','bs'].indexOf(tipe) === -1) return 'Soal #' + no + ': tipe harus pg/mcma/bs';
    if (!s.q || !s.q.trim()) return 'Soal #' + no + ': q wajib';
    if (tipe === 'pg' || tipe === 'mcma') {
      if (!Array.isArray(s.options) || s.options.length < 2) return 'Soal #' + no + ': options minimal 2';
      if (tipe === 'pg' && !Number.isInteger(s.key)) return 'Soal #' + no + ': key PG harus angka';
      if (tipe === 'mcma' && (!Array.isArray(s.key) || s.key.length < 2)) return 'Soal #' + no + ': key MCMA minimal 2';
    }
    if (tipe === 'bs' && (!Array.isArray(s.pernyataan) || s.pernyataan.length < 2)) return 'Soal #' + no + ': pernyataan minimal 2';
  }
  return null;
}

function showPreview(paket) {
  var previewEl = document.getElementById('jsonPreview');
  if (!previewEl) return;
  var tipeCount = { pg: 0, mcma: 0, bs: 0 };
  paket.soal.forEach(function(s) { tipeCount[s.tipe.toLowerCase()]++; });
  var parts = [];
  if (tipeCount.pg) parts.push(tipeCount.pg + ' PG');
  if (tipeCount.mcma) parts.push(tipeCount.mcma + ' MCMA');
  if (tipeCount.bs) parts.push(tipeCount.bs + ' BS');
  previewEl.innerHTML = '<div style="font-weight:700;color:#166534;margin-bottom:8px">✅ JSON Valid</div>' +
    '<div><b>ID:</b> ' + escapeHtml(paket.id) + '</div>' +
    '<div><b>Judul:</b> ' + escapeHtml(paket.judul) + '</div>' +
    '<div><b>Mapel:</b> ' + escapeHtml(paket.mapel) + '</div>' +
    '<div><b>Durasi:</b> ' + paket.durasiMenit + ' menit</div>' +
    '<div><b>Soal:</b> ' + paket.soal.length + ' (' + parts.join(', ') + ')</div>';
  previewEl.style.display = 'block';
}

function handleFileSelect(input) {
  var file = input.files && input.files[0];
  var errEl = document.getElementById('jsonError');
  var fileNameEl = document.getElementById('fileNameDisplay');
  var previewEl = document.getElementById('jsonPreview');
  var btn = document.getElementById('btnProsesImport');
  if (!file) return;
  if (fileNameEl) fileNameEl.textContent = '📄 ' + file.name + ' (' + (file.size / 1024).toFixed(1) + ' KB)';
  if (errEl) errEl.textContent = '';
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var parsed = JSON.parse(e.target.result);
      var err = validateSchema(parsed);
      if (err) { if(errEl) errEl.textContent='⚠️ ' + err; if(previewEl) previewEl.style.display='none'; if(btn) btn.disabled=true; parsedJSONCache=null; return; }
      parsedJSONCache = parsed;
      showPreview(parsed);
      if(btn) btn.disabled = false;
    } catch (err) {
      if(errEl) errEl.textContent = '❌ ' + err.message;
      if(previewEl) previewEl.style.display='none';
      if(btn) btn.disabled=true;
      parsedJSONCache=null;
    }
  };
  reader.readAsText(file);
}

async function prosesImportJSON(payload) {
  if (!payload && !parsedJSONCache) return;
  var body = payload || { json: JSON.stringify(parsedJSONCache) };
  var btn = document.getElementById('btnProsesImport');
  if (btn) { btn.disabled = true; btn.textContent = 'Memproses...'; }
  try {
    var r = await fetch('/api/teacher/import-json', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    var d = await r.json();
    if (r.status === 409 && d.exists) {
      // Konflik — tanyakan user
      var pilihan = await Swal.fire({
        icon: 'warning',
        title: 'Paket Sudah Ada',
        html: 'Paket dengan ID <b>' + d.id + '</b> sudah ada.<br>Apa yang ingin Anda lakukan?',
        showDenyButton: true,
        showCancelButton: true,
        confirmButtonText: 'Timpa Paket Lama',
        denyButtonText: 'Ganti ID Baru',
        cancelButtonText: 'Batal',
        confirmButtonColor: '#dc2626',
        denyButtonColor: '#1e40af',
        cancelButtonColor: '#64748b'
      });
      if (pilihan.isConfirmed) {
        // Overwrite
        return prosesImportJSON(Object.assign({}, body, { overwrite: true }));
      }
      if (pilihan.isDenied) {
        var newId = await swalPrompt('ID paket baru:', d.id + '-v2');
        if (!newId) { if (btn) { btn.disabled = false; btn.textContent = '📥 Proses Import JSON'; } return; }
        newId = slugify(newId);
        return prosesImportJSON(Object.assign({}, body, { newId: newId }));
      }
      // Cancel
      if (btn) { btn.disabled = false; btn.textContent = '📥 Proses Import JSON'; }
      return;
    }
    if (!r.ok) {
      await swalError(d.error || 'Gagal import');
      if (btn) { btn.disabled = false; btn.textContent = '📥 Proses Import JSON'; }
      return;
    }
    await swalSuccess('Paket "' + d.paketId + '" diimpor: ' + d.jumlahSoal + ' soal');
    await loadPaket();
    tutupModalBuatPaket();
  } catch (e) {
    await swalError(e.message);
    if (btn) { btn.disabled = false; btn.textContent = '📥 Proses Import JSON'; }
  }
}
// Drag & drop JSON
document.addEventListener('DOMContentLoaded', function() {
  var dz = document.getElementById('jsonDropzone');
  if (!dz) return;
  ['dragenter','dragover'].forEach(function(evt) {
    dz.addEventListener(evt, function(e) { e.preventDefault(); e.stopPropagation(); dz.style.background='#dbeafe'; dz.style.borderColor='#1e40af'; });
  });
  ['dragleave','drop'].forEach(function(evt) {
    dz.addEventListener(evt, function(e) { e.preventDefault(); e.stopPropagation(); dz.style.background=''; dz.style.borderColor=''; });
  });
  dz.addEventListener('drop', function(e) {
    var files = e.dataTransfer.files;
    if (files && files.length > 0) {
      var input = document.getElementById('jsonFileInput');
      input.files = files;
      handleFileSelect(input);
    }
  });
});

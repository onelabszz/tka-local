
// ============================================================
// IMPORT JSON MODAL (v2)
// ============================================================
let parsedJSONCache = null;
let currentTabImport = 'paste';

function bukaModalImportJSON() {
  document.getElementById('jsonPasteArea').value = '';
  document.getElementById('jsonFileInput').value = '';
  document.getElementById('fileNameDisplay').textContent = '';
  document.getElementById('pasteError').textContent = '';
  document.getElementById('uploadError').textContent = '';
  document.getElementById('jsonPreview').style.display = 'none';
  document.getElementById('btnProsesImport').disabled = true;
  parsedJSONCache = null;
  switchTabImport('paste');
  var modal = document.getElementById('modalImportJSON');
  modal.classList.remove('hidden');  // ← hapus class hidden
  modal.style.display = 'flex';
}

function tutupModalImportJSON() {
  var modal = document.getElementById('modalImportJSON');
  modal.style.display = 'none';
  // Jangan tambahkan class 'hidden' kembali untuk menghindari konflik CSS
}

function switchTabImport(tab) {
  currentTabImport = tab;
  const tabPaste = document.getElementById('tabPaste');
  const tabUpload = document.getElementById('tabUpload');
  const panePaste = document.getElementById('panePaste');
  const paneUpload = document.getElementById('paneUpload');
  if (tab === 'paste') {
    tabPaste.style.background = 'white';
    tabPaste.style.color = '#1e40af';
    tabPaste.style.borderBottomColor = '#1e40af';
    tabUpload.style.background = '#f8fafc';
    tabUpload.style.color = '#64748b';
    tabUpload.style.borderBottomColor = 'transparent';
    panePaste.style.display = 'block';
    paneUpload.style.display = 'none';
  } else {
    tabUpload.style.background = 'white';
    tabUpload.style.color = '#1e40af';
    tabUpload.style.borderBottomColor = '#1e40af';
    tabPaste.style.background = '#f8fafc';
    tabPaste.style.color = '#64748b';
    tabPaste.style.borderBottomColor = 'transparent';
    paneUpload.style.display = 'block';
    panePaste.style.display = 'none';
  }
}

function validateJSONRealtime(text) {
  const errorEl = document.getElementById('pasteError');
  const previewEl = document.getElementById('jsonPreview');
  const btn = document.getElementById('btnProsesImport');
  
  if (!text.trim()) {
    errorEl.textContent = '';
    previewEl.style.display = 'none';
    btn.disabled = true;
    parsedJSONCache = null;
    return;
  }
  
  try {
    const parsed = JSON.parse(text);
    errorEl.textContent = '';
    // Validate schema
    const err = validateSchema(parsed);
    if (err) {
      errorEl.textContent = '⚠️ ' + err;
      previewEl.style.display = 'none';
      btn.disabled = true;
      parsedJSONCache = null;
      return;
    }
    parsedJSONCache = parsed;
    showPreview(parsed);
    btn.disabled = false;
  } catch (e) {
    errorEl.textContent = '❌ JSON tidak valid: ' + e.message;
    previewEl.style.display = 'none';
    btn.disabled = true;
    parsedJSONCache = null;
  }
}

function validateSchema(paket) {
  if (!paket || typeof paket !== 'object') return 'File bukan JSON object';
  if (!paket.id || !/^[a-z0-9-]+$/.test(paket.id)) return 'Field "id" wajib huruf kecil, angka, minus';
  if (!paket.judul || !paket.judul.trim()) return 'Field "judul" wajib diisi';
  if (!paket.mapel || !paket.mapel.trim()) return 'Field "mapel" wajib diisi';
  if (!Number.isFinite(paket.durasiMenit) || paket.durasiMenit <= 0) return 'Field "durasiMenit" wajib angka positif';
  if (!Array.isArray(paket.soal) || paket.soal.length === 0) return 'Field "soal" wajib array minimal 1 soal';
  for (let i = 0; i < paket.soal.length; i++) {
    const s = paket.soal[i];
    const no = i + 1;
    if (!s.id) return 'Soal #' + no + ': id wajib';
    const tipe = (s.tipe || '').toLowerCase();
    if (!['pg','mcma','bs'].includes(tipe)) return 'Soal #' + no + ': tipe harus pg/mcma/bs';
    if (!s.q || !s.q.trim()) return 'Soal #' + no + ': q wajib diisi';
    if (tipe === 'pg' || tipe === 'mcma') {
      if (!Array.isArray(s.options) || s.options.length < 2) return 'Soal #' + no + ': options minimal 2';
      if (tipe === 'pg' && !Number.isInteger(s.key)) return 'Soal #' + no + ': key PG harus angka';
      if (tipe === 'mcma' && (!Array.isArray(s.key) || s.key.length < 2)) return 'Soal #' + no + ': key MCMA minimal 2';
    }
    if (tipe === 'bs' && (!Array.isArray(s.pernyataan) || s.pernyataan.length < 2)) {
      return 'Soal #' + no + ': pernyataan minimal 2';
    }
  }
  return null;
}

function showPreview(paket) {
  const previewEl = document.getElementById('jsonPreview');
  const content = document.getElementById('jsonPreviewContent');
  const tipeCount = { pg: 0, mcma: 0, bs: 0 };
  paket.soal.forEach(s => { tipeCount[s.tipe.toLowerCase()]++; });
  content.innerHTML = 
    '<div><b>ID:</b> ' + paket.id + '</div>' +
    '<div><b>Judul:</b> ' + paket.judul + '</div>' +
    '<div><b>Mapel:</b> ' + paket.mapel + '</div>' +
    '<div><b>Durasi:</b> ' + paket.durasiMenit + ' menit</div>' +
    '<div><b>Total Soal:</b> ' + paket.soal.length + ' (' +
      (tipeCount.pg ? tipeCount.pg + ' PG, ' : '') +
      (tipeCount.mcma ? tipeCount.mcma + ' MCMA, ' : '') +
      (tipeCount.bs ? tipeCount.bs + ' BS' : '') + ')</div>';
  previewEl.style.display = 'block';
}

function handleFileSelect(input) {
  const file = input.files[0];
  const errorEl = document.getElementById('uploadError');
  const fileNameEl = document.getElementById('fileNameDisplay');
  const previewEl = document.getElementById('jsonPreview');
  const btn = document.getElementById('btnProsesImport');
  
  if (!file) return;
  fileNameEl.textContent = '📄 ' + file.name + ' (' + (file.size / 1024).toFixed(1) + ' KB)';
  errorEl.textContent = '';
  
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const parsed = JSON.parse(e.target.result);
      const err = validateSchema(parsed);
      if (err) {
        errorEl.textContent = '⚠️ ' + err;
        previewEl.style.display = 'none';
        btn.disabled = true;
        parsedJSONCache = null;
        return;
      }
      parsedJSONCache = parsed;
      showPreview(parsed);
      btn.disabled = false;
    } catch (err) {
      errorEl.textContent = '❌ ' + err.message;
      previewEl.style.display = 'none';
      btn.disabled = true;
      parsedJSONCache = null;
    }
  };
  reader.readAsText(file);
}

async function prosesImportJSON() {
  if (!parsedJSONCache) return;
  const btn = document.getElementById('btnProsesImport');
  btn.disabled = true;
  btn.textContent = 'Memproses...';
  try {
    const r = await fetch('/api/teacher/import-json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ json: JSON.stringify(parsedJSONCache) })
    });
    const d = await r.json();
    if (!r.ok) {
      await swalError(d.error || 'Gagal import');
      btn.disabled = false;
      btn.textContent = '📥 Proses Import';
      return;
    }
    await swalSuccess('Paket "' + d.paketId + '" berhasil diimpor: ' + d.jumlahSoal + ' soal');
    await loadPaket();
    tutupModalImportJSON();
  } catch (e) {
    await swalError(e.message);
    btn.disabled = false;
    btn.textContent = '📥 Proses Import';
  }
}

// Drag & drop setup
document.addEventListener('DOMContentLoaded', function() {
  const dz = document.getElementById('dropZone');
  if (!dz) return;
  ['dragenter', 'dragover'].forEach(evt => {
    dz.addEventListener(evt, function(e) {
      e.preventDefault(); e.stopPropagation();
      dz.style.background = '#dbeafe';
      dz.style.borderColor = '#1e40af';
    });
  });
  ['dragleave', 'drop'].forEach(evt => {
    dz.addEventListener(evt, function(e) {
      e.preventDefault(); e.stopPropagation();
      dz.style.background = '#f8fafc';
      dz.style.borderColor = '#cbd5e1';
    });
  });
  dz.addEventListener('drop', function(e) {
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      document.getElementById('jsonFileInput').files = files;
      handleFileSelect(document.getElementById('jsonFileInput'));
    }
  });
});






function previewSlug() {
  var slug = slugify(document.getElementById('impPaketId').value || document.getElementById('impJudul').value);
  document.getElementById('impSlugPreview').textContent = 'ID final: ' + (slug || '(kosong)');
}
async function loadPaket() {
  var r = await fetch('/api/teacher/paket');
  var paket = await r.json();
  var sel = document.getElementById('paketSelect');
  if (!paket.length) {
    sel.innerHTML = '<option value="">(Tidak ada paket — import CSV di menu Paket Soal)</option>';
  } else {
    sel.innerHTML = paket.map(function(p) {
      return '<option value="' + p.id + '">' + escapeHtml(p.judul) + ' — ' + escapeHtml(p.mapel) + ' (' + p.jumlahSoal + ' soal / ' + p.durasiMenit + ' mnt)</option>';
    }).join('');
  }
  var tbody = document.getElementById('paketTable');
  if (!paket.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="muted" style="text-align:center;padding:36px">Belum ada paket</td></tr>';
    return;
  }
  tbody.innerHTML = paket.map(function(p, i) {
    return '<tr>' +
      '<td>' + (i + 1) + '</td>' +
      '<td><b>' + escapeHtml(p.judul) + '</b></td>' +
      '<td>' + escapeHtml(p.mapel) + '</td>' +
      '<td>' + p.jumlahSoal + '</td>' +
      '<td>' + p.durasiMenit + ' mnt</td>' +
      '<td style="font-size:12px">' + (p.acakMode === 'full' ? 'Acak Total' : p.acakMode === 'none' ? 'Tidak Acak' : 'Per Tipe') + '</td>' +
      '<td><div class="table-actions">' +
        '<button class="btn btn-primary btn-sm" onclick="mulaiPaket(\'' + p.id + '\')">Jalankan</button>' +
        '<button class="btn ' + (p.latihanMandiri ? 'btn-success' : 'btn-secondary') + ' btn-sm" onclick="toggleLatihan(\'' + p.id + '\',' + (p.latihanMandiri ? 'true' : 'false') + ')">Latihan: ' + (p.latihanMandiri ? 'ON' : 'OFF') + '</button>' +
        '<button class="btn btn-secondary btn-sm" onclick="bukaEditor(\'' + p.id + '\')">Edit</button>' +
        '<button class="btn btn-secondary btn-sm" onclick="previewPaketById(\'' + p.id + '\')">Preview</button>' +
        '<button class="btn btn-secondary btn-sm" onclick="duplikatPaketById(\'' + p.id + '\')">Duplikat</button>' +
        '<button class="btn btn-secondary btn-sm" onclick="exportPaketCsvById(\'' + p.id + '\')">Export</button>' +
        '<button class="btn btn-danger btn-sm" onclick="hapusPaketById(\'' + p.id + '\')">Hapus</button>' +
      '</div></td>' +
    '</tr>';
  }).join('');
}
function mulaiPaket(paketId) {
  document.getElementById('paketSelect').value = paketId;
  startExam();
}
async function previewPaketById(paketId) {
  swalLoading('Memuat paket...');
  try {
    var r = await fetch('/api/teacher/paket/' + paketId + '/preview');
    var data = await r.json();
    if (!r.ok) { Swal.close(); await swalError(data.error || 'Tidak diketahui'); return; }
    var items = data.soal.map(function(s, i) {
      var tipe = s.tipe || 'pg';
      var imgHtml = s.img ? '<img src="/gambar/' + encodeURIComponent(s.img) + '" style="display:block;max-width:100%;max-height:220px;margin:8px auto;border-radius:4px" alt="">' : '';
      var body = '';
      if (tipe === 'bs') {
        var pernyataan = s.pernyataan || [];
        body = '<table style="width:100%;border-collapse:collapse;margin:8px 0;border:1px solid #e2e8f0;border-radius:4px;overflow:hidden"><thead><tr style="background:#f1f5f9"><th style="padding:8px;text-align:left;font-size:12px">Pernyataan</th><th style="padding:8px;text-align:center;font-size:12px;width:60px">Kunci</th></tr></thead><tbody>' +
          pernyataan.map(function(p) {
            return '<tr><td style="padding:8px;border-top:1px solid #e2e8f0;font-size:13px">' + escapeHtml(p.teks) + '</td><td style="padding:8px;border-top:1px solid #e2e8f0;text-align:center;font-weight:700;color:' + (p.key ? '#047857' : '#b91c1c') + '">' + (p.key ? 'B' : 'S') + '</td></tr>';
          }).join('') + '</tbody></table>';
      } else {
        var options = s.options || [];
        var kunciArr = tipe === 'mcma' ? (Array.isArray(s.key) ? s.key : [s.key]) : [s.key];
        body = options.map(function(o, idx) {
          var isK = kunciArr.indexOf(idx) >= 0;
          var oi = (s.optionImgs && s.optionImgs[idx]) ? '<img src="/gambar/' + encodeURIComponent(s.optionImgs[idx]) + '" style="display:block;max-width:100%;max-height:80px;margin-top:4px;border-radius:3px" alt="">' : '';
          return '<div style="padding:8px 12px;border-radius:4px;margin:4px 0;border:1px solid ' + (isK ? '#86efac' : '#e2e8f0') + ';background:' + (isK ? '#d1fae5' : '#f8fafc') + '"><b>' + String.fromCharCode(65 + idx) + '.</b> ' + escapeHtml(o || '') + (isK ? ' <b style="color:#047857">[KUNCI]</b>' : '') + oi + '</div>';
        }).join('');
      }
      var tipeBadge = tipe === 'mcma' ? '<span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:700">MCMA</span>'
                    : tipe === 'bs' ? '<span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:700">B/S</span>'
                    : '<span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:700">PG</span>';
      var pemb = s.pembahasan ? '<div style="margin-top:10px;padding:10px;background:#f1f5f9;border-radius:4px;font-size:12px;border-left:3px solid #1e40af"><b>Pembahasan:</b> ' + escapeHtml(s.pembahasan) + '</div>' : '';
      return '<div style="border:1px solid #e2e8f0;border-radius:4px;padding:14px;margin-bottom:10px;text-align:left"><div style="margin-bottom:8px;font-size:13px"><b>' + (i + 1) + '.</b> ' + tipeBadge + ' ' + escapeHtml(s.q) + '</div>' + imgHtml + body + pemb + '</div>';
    }).join('');
    Swal.fire({
      title: escapeHtml(data.judul) + ' — ' + escapeHtml(data.mapel),
      html: '<div style="font-size:13px;color:#64748b;margin-bottom:12px">' + data.soal.length + ' soal / ' + data.durasiMenit + ' menit</div>' + items,
      width: '850px', showCloseButton: true, showConfirmButton: false,
      showCancelButton: true, cancelButtonText: 'Tutup', cancelButtonColor: '#64748b'
    });
  } catch (e) {
    Swal.close();
    await swalError('Gagal memuat preview: ' + e.message);
  }
}
async function duplikatPaketById(paketId) {
  var newId = await swalPrompt('ID paket baru:', paketId + '-copy');
  if (newId == null) return;
  newId = slugify(newId);
  if (!newId) { await swalError('ID tidak valid'); return; }
  var judul = await swalPrompt('Judul paket baru:', paketId + ' (salinan)');
  if (judul == null) return;
  var r = await fetch('/api/teacher/paket/' + paketId + '/duplikat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paketId: newId, judul: judul || newId })
  });
  var d = await r.json();
  if (!r.ok) { await swalError(d.error || 'Gagal'); return; }
  await swalSuccess('Paket "' + d.paketId + '" dibuat (' + d.jumlahSoal + ' soal)');
  await loadPaket();
}
function exportPaketCsvById(paketId) { window.open('/api/teacher/paket/' + paketId + '/export-csv', '_blank'); }
async function hapusPaketById(paketId) {
  if (!await swalConfirm('Hapus paket "' + paketId + '"? File JSON-nya akan dihapus dari server.', 'Hapus Paket')) return;
  var r = await fetch('/api/teacher/hapus-paket', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paketId: paketId })
  });
  var d = await r.json();
  if (!d.ok) { await swalError(d.error || 'Gagal'); return; }
  await swalSuccess('Paket dihapus');
  await loadPaket();
}
function downloadTemplate() { window.open('/api/teacher/template-csv', '_blank'); }
async function importCSV() {
  const file = document.getElementById('csvFile').files[0];
  const info = document.getElementById('importInfo');
  if (!file) { await swalInfo('Pilih file CSV dulu'); return; }
  var idInput = document.getElementById('impPaketId').value.trim();
  var judulInput = document.getElementById('impJudul').value.trim();
  if (!idInput && !judulInput) {
    var namaFile = file.name.replace(/\.csv$/i, '');
    idInput = namaFile;
    document.getElementById('impPaketId').value = namaFile;
    document.getElementById('impJudul').value = namaFile;
    judulInput = namaFile;
  }
  var paketId = slugify(idInput || judulInput);
  if (!paketId) { await swalError('ID kosong. Isi ID atau Judul.'); return; }
  info.textContent = 'Membaca file…';
  const csv = await file.text();
  info.textContent = 'Mengimpor…';
  const r = await fetch('/api/teacher/import-csv', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      paketId: paketId,
      judul: judulInput || paketId,
      mapel: document.getElementById('impMapel').value.trim() || 'Campuran',
      durasiMenit: parseInt(document.getElementById('impDurasi').value) || 15,
      csv: csv
    })
  });
  const d = await r.json();
  if (!r.ok) { info.textContent = ''; await swalError(d.error || 'Gagal import', 'Import Gagal'); return; }
  info.textContent = 'Berhasil: paket "' + d.paketId + '" (' + d.jumlahSoal + ' soal)';
  document.getElementById('impPaketId').value = '';
  document.getElementById('impJudul').value = '';
  document.getElementById('csvFile').value = '';
  document.getElementById('impSlugPreview').textContent = 'ID final: (kosong)';
  await swalSuccess('Paket "' + d.paketId + '" diimpor: ' + d.jumlahSoal + ' soal');
  await loadPaket();
}

async function toggleLatihan(paketId, aktifSekarang) {
  const aktif = !aktifSekarang;
  try {
    const r = await fetch('/api/teacher/toggle-latihan', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paketId: paketId, aktif: aktif })
    });
    const d = await r.json();
    if (!d.ok) { await swalError(d.error || 'Gagal'); return; }
    await swalSuccess(aktif ? 'Latihan mandiri AKTIF untuk paket ini' : 'Latihan mandiri DIMATIKAN');
    await loadPaket();
  } catch (e) { await swalError(e.message); }
}

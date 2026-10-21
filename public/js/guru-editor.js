let editorPaket = null;
let editorDirty = false;
let activeImageTarget = null;
let autosaveTimer = null;

async function bukaEditor(paketId) {
  const draft = editorCekDraft(paketId);
  if (draft && draft.paket) {
    const menit = Math.floor((Date.now() - draft.savedAt) / 60000);
    const label = menit < 1 ? 'baru saja' : menit + ' menit lalu';
    const r = await Swal.fire({
      icon: 'question', title: 'Draft ditemukan',
      html: 'Ada draft tersimpan <b>' + label + '</b>.<br>Lanjutkan draft, atau muat versi terbaru dari server?',
      showDenyButton: true, showCancelButton: true, confirmButtonText: 'Lanjutkan draft', denyButtonText: 'Muat dari server', cancelButtonText: 'Batal',
      confirmButtonColor: '#1e40af', denyButtonColor: '#64748b', cancelButtonColor: '#94a3b8'
    });
    if (r.isDismissed) return;
    if (r.isConfirmed) {
      editorPaket = draft.paket;
      normalizeEditorState();
      editorDirty = true;
      openEditorView();
      return;
    }
    editorClearDraft(paketId);
  }

  swalLoading('Memuat paket...');
  try {
    const r = await fetch('/api/teacher/paket/' + paketId + '/preview');
    if (!r.ok) { Swal.close(); await swalError('Paket tidak ditemukan'); return; }
    editorPaket = await r.json();
    normalizeEditorState();
    editorDirty = false;
    Swal.close();
    openEditorView();
  } catch (e) { Swal.close(); await swalError(e.message); }
}

function normalizeEditorState() {
  editorPaket.soal.forEach(function(s, i) {
    if (!s.id) s.id = editorPaket.id + '-s' + (i + 1);
    if (!s.tipe) s.tipe = 'pg';
    if (!s.q) s.q = '';
    if (!s.options) s.options = ['','','',''];
    if (s.tipe === 'pg' && typeof s.key !== 'number') s.key = 0;
    if (s.tipe === 'mcma' && !Array.isArray(s.key)) s.key = [];
    if (s.tipe === 'bs' && !Array.isArray(s.pernyataan)) s.pernyataan = [{ teks: '', key: null }, { teks: '', key: null }];
  });
}

function openEditorView() {
  document.getElementById('editorTitle').textContent = 'Edit: ' + editorPaket.judul;
  document.getElementById('editorJudul').value = editorPaket.judul || '';
  document.getElementById('editorMapel').value = editorPaket.mapel || '';
  document.getElementById('editorDurasi').value = editorPaket.durasiMenit || 15;
  document.getElementById('editorAcakMode').value = editorPaket.acakMode || 'per-tipe';
  updateEditorHeader();
  setEditorDirty(editorDirty);
  renderEditorSoal();
  navigate('editor');
}

function updateEditorHeader() {
  const b = document.getElementById('editorDirtyBadge');
  if (!b) return;
  const total = editorPaket.soal.length;
  if (editorDirty) {
    b.textContent = total + ' soal · belum disimpan';
    b.style.display = 'inline-block';
    b.className = 'badge badge-warn';
  } else {
    b.textContent = total + ' soal';
    b.style.display = 'inline-block';
    b.className = 'badge badge-info';
    setTimeout(() => { if (!editorDirty) b.style.display = 'none'; }, 2000);
  }
}

function setEditorDirty(v) {
  const wasDirty = editorDirty;
  editorDirty = v;
  updateEditorHeader();
  if (v) { clearTimeout(autosaveTimer); autosaveTimer = setTimeout(editorAutosave, 1500); }
  else if (wasDirty) editorClearDraft();
}

function editorAutosave() {
  if (!editorPaket || !editorDirty) return;
  try {
    localStorage.setItem('tka_editor_draft_' + editorPaket.id, JSON.stringify({ paket: editorPaket, savedAt: Date.now() }));
    const b = document.getElementById('editorDirtyBadge');
    if (b) { b.textContent = editorPaket.soal.length + ' soal · draft tersimpan'; setTimeout(updateEditorHeader, 1500); }
  } catch (e) { console.warn('Autosave gagal:', e.message); }
}

function editorClearDraft(paketId) {
  const id = paketId || (editorPaket && editorPaket.id);
  if (!id) return;
  try { localStorage.removeItem('tka_editor_draft_' + id); } catch (e) {}
}

function editorCekDraft(paketId) {
  try {
    const raw = localStorage.getItem('tka_editor_draft_' + paketId);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d.paket || !d.savedAt) return null;
    if (Date.now() - d.savedAt > 24 * 3600 * 1000) { localStorage.removeItem('tka_editor_draft_' + paketId); return null; }
    return d;
  } catch (e) { return null; }
}

function editorKembali() {
  if (editorDirty && !confirm('Ada perubahan belum disimpan. Yakin keluar?')) return;
  editorPaket = null; editorDirty = false; navigate('paket');
}

function renderEditorSoal() {
  var el = document.getElementById('editorSoalList');
  if (!editorPaket.soal.length) {
    el.innerHTML = '<div class="card"><p class="muted">Belum ada soal. Klik "Tambah Soal".</p></div>';
    return;
  }
  el.innerHTML = editorPaket.soal.map(renderKartuSoal).join('');
  setTimeout(function() {
    editorPaket.soal.forEach(function(s, i) {
      renderLivePreview('preview-soal-' + i, s.q);
      if (s.options) {
        s.options.forEach(function(opt, idx) { renderLivePreview('preview-opsi-' + i + '-' + idx, opt); });
      }
    });
  }, 100);
}

function renderLivePreview(id, text) {
  var el = document.getElementById(id);
  if (!el) return;
  if (!text || !text.trim()) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.innerHTML = escapeHtml(text);
  if (window.renderMathInElement) {
    renderMathInElement(el, { delimiters: [{left: '$$', right: '$$', display: true}, {left: '$', right: '$', display: false}], throwOnError: false });
  }
}

function renderKartuSoal(s, i) {
  var tipe = s.tipe || 'pg';
  var html = '<div class="card" data-idx="' + i + '">';
  html += '<div class="card-title"><span>Soal #' + (i + 1) + ' <span class="badge badge-info">' + tipe.toUpperCase() + '</span></span><div>';
  html += '<button class="btn btn-secondary btn-sm" onclick="editorDuplikatSoal(' + i + ')">Duplikat</button> ';
  html += '<button class="btn btn-danger btn-sm" onclick="editorHapusSoal(' + i + ')">Hapus</button>';
  html += '</div></div>';
  html += '<div style="margin-bottom:12px"><label class="muted">Tipe soal</label><select class="form-input" onchange="editorUbahTipe(' + i + ',this.value)">';
  [['pg','PG (satu jawaban)'],['mcma','MCMA (pilihan ganda kompleks)'],['bs','Benar/Salah (pernyataan)']].forEach(function(o) {
    html += '<option value="' + o[0] + '"' + (tipe === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
  });
  html += '</select></div>';
  html += '<div style="margin-bottom:8px"><label class="muted">Teks soal</label>';
  html += '<div class="math-toolbar" style="margin-bottom:4px;display:flex;gap:4px;">';
  html += '<button type="button" class="btn btn-secondary btn-sm" onclick="sisipkanPecahan(' + i + ')">a/b</button>';
  html += '<button type="button" class="btn btn-secondary btn-sm" onclick="sisipkanPangkat(' + i + ')">x²</button>';
  html += '<button type="button" class="btn btn-secondary btn-sm" onclick="sisipkanAkar(' + i + ')">√</button>';
  html += '</div>';
  html += '<textarea id="teks-soal-' + i + '" class="form-input" rows="2" oninput="editorUpdateField(' + i + ',\'q\',this.value)">' + escapeHtml(s.q || '') + '</textarea>';
  html += '<div id="preview-soal-' + i + '" class="math-preview" style="display:none;"></div></div>';
  html += renderGambarField(i, 'img', s.img, 'Gambar soal (opsional)');
  if (tipe === 'bs') html += renderBsEditor(s, i);
  else html += renderOpsiEditor(s, i, tipe);
  html += '<div style="margin-top:12px"><label class="muted">Pembahasan (opsional)</label><textarea class="form-input" rows="2" oninput="editorUpdateField(' + i + ',\'pembahasan\',this.value)">' + escapeHtml(s.pembahasan || '') + '</textarea></div>';
  html += '</div>';
  return html;
}

function sisipkanPecahan(i) {
  var el = document.getElementById('teks-soal-' + i); if (!el) return;
  var start = el.selectionStart; var end = el.selectionEnd; var text = el.value; var math = '$\\frac{a}{b}$';
  el.value = text.substring(0, start) + math + text.substring(end); editorUpdateField(i, 'q', el.value);
  el.focus(); el.selectionStart = el.selectionEnd = start + math.length;
}
function sisipkanPangkat(i) {
  var el = document.getElementById('teks-soal-' + i); if (!el) return;
  var start = el.selectionStart; var end = el.selectionEnd; var text = el.value; var math = '$x^{2}$';
  el.value = text.substring(0, start) + math + text.substring(end); editorUpdateField(i, 'q', el.value);
  el.focus(); el.selectionStart = el.selectionEnd = start + math.length;
}
function sisipkanAkar(i) {
  var el = document.getElementById('teks-soal-' + i); if (!el) return;
  var start = el.selectionStart; var end = el.selectionEnd; var text = el.value; var math = '$\\sqrt{x}$';
  el.value = text.substring(0, start) + math + text.substring(end); editorUpdateField(i, 'q', el.value);
  el.focus(); el.selectionStart = el.selectionEnd = start + math.length;
}

function renderGambarField(soalIdx, field, namaFile, label) {
  var html = '<div style="margin:8px 0"><label class="muted">' + label + '</label><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:4px">';
  if (namaFile) {
    html += '<img src="/gambar/' + encodeURIComponent(namaFile) + '" style="max-height:50px;border-radius:4px;border:1px solid #e2e8f0">';
    html += '<span class="muted" style="font-size:11px">' + escapeHtml(namaFile) + '</span>';
    html += '<button class="btn btn-danger btn-sm" onclick="editorHapusGambar(' + soalIdx + ',\'' + field + '\')">Lepas</button>';
    html += '<button class="btn btn-secondary btn-sm" onclick="openImagePicker(' + soalIdx + ',\'' + field + '\')">Ganti</button>';
  } else {
    html += '<button class="btn btn-secondary btn-sm" onclick="openImagePicker(' + soalIdx + ',\'' + field + '\')">📷 Pilih Gambar</button>';
  }
  html += '</div></div>';
  return html;
}

function renderOpsiEditor(s, i, tipe) {
  var html = '<div style="margin-bottom:12px"><label class="muted">Opsi jawaban (' + (tipe === 'mcma' ? 'bisa pilih lebih dari satu kunci' : 'satu kunci') + ')</label>';
  var kunciArr = tipe === 'mcma' ? (Array.isArray(s.key) ? s.key : []) : [s.key];
  var letters = ['A','B','C','D'];
  for (var idx = 0; idx < 4; idx++) {
    var opt = (s.options && s.options[idx]) || '';
    var optImg = s.optionImgs && s.optionImgs[idx];
    var isK = kunciArr.indexOf(idx) >= 0;
    html += '<div style="display:grid;grid-template-columns:24px 1fr auto;gap:8px;align-items:start;margin:6px 0;padding:8px;border:1.5px solid ' + (isK ? '#86efac' : '#e2e8f0') + ';border-radius:6px;background:' + (isK ? '#f0fdf4' : '#f8fafc') + '">';
    html += '<div style="font-weight:700;padding-top:8px">' + letters[idx] + '</div>';
    html += '<div><input class="form-input" value="' + escapeHtml(opt) + '" placeholder="Teks opsi ' + letters[idx] + '" oninput="editorUpdateOpsi(' + i + ',' + idx + ',this.value)">';
    html += '<div id="preview-opsi-' + i + '-' + idx + '" class="math-preview" style="display:none;"></div>';
    if (optImg) {
      html += '<div style="margin-top:6px;display:flex;gap:6px;align-items:center"><img src="/gambar/' + encodeURIComponent(optImg) + '" style="max-height:36px;border-radius:3px"><span class="muted" style="font-size:11px">' + escapeHtml(optImg) + '</span><button class="btn btn-danger btn-sm" onclick="editorHapusGambar(' + i + ',\'optionImgs.' + idx + '\')">×</button></div>';
    }
    html += '</div>';
    html += '<div style="display:flex;flex-direction:column;gap:4px"><button class="btn btn-secondary btn-sm" onclick="openImagePicker(' + i + ',\'optionImgs.' + idx + '\')">📷</button>';
    if (tipe === 'pg') html += '<button class="btn ' + (isK ? 'btn-success' : 'btn-secondary') + ' btn-sm" onclick="editorSetKunciPg(' + i + ',' + idx + ')" title="Jadikan kunci">' + (isK ? '✓' : '○') + '</button>';
    else html += '<button class="btn ' + (isK ? 'btn-success' : 'btn-secondary') + ' btn-sm" onclick="editorToggleKunciMcma(' + i + ',' + idx + ')">' + (isK ? '✓' : '○') + '</button>';
    html += '</div></div>';
  }
  html += '</div>';
  return html;
}

function renderBsEditor(s, i) {
  var html = '<div style="margin-bottom:12px"><label class="muted">Pernyataan (minimal 2)</label>';
  var p = s.pernyataan || [];
  p.forEach(function(item, idx) {
    html += '<div style="display:grid;grid-template-columns:1fr auto auto auto;gap:6px;align-items:center;margin:6px 0;padding:8px;border:1px solid #e2e8f0;border-radius:6px;background:#f8fafc">';
    html += '<input class="form-input" value="' + escapeHtml(item.teks) + '" placeholder="Pernyataan ' + (idx + 1) + '" oninput="editorUpdatePernyataan(' + i + ',' + idx + ',this.value)">';
    html += '<button class="btn ' + (item.key === true ? 'btn-success' : 'btn-secondary') + ' btn-sm" onclick="editorSetBs(' + i + ',' + idx + ',true)">B</button>';
    html += '<button class="btn ' + (item.key === false ? 'btn-success' : 'btn-secondary') + ' btn-sm" onclick="editorSetBs(' + i + ',' + idx + ',false)">S</button>';
    html += '<button class="btn btn-danger btn-sm" onclick="editorHapusPernyataan(' + i + ',' + idx + ')">×</button>';
    html += '</div>';
  });
  html += '<button class="btn btn-secondary btn-sm" onclick="editorTambahPernyataan(' + i + ')">+ Tambah Pernyataan</button>';
  html += '</div>';
  return html;
}

function editorUpdateField(i, field, value) { 
  editorPaket.soal[i][field] = value; 
  setEditorDirty(true); 
  if (field === 'q') renderLivePreview('preview-soal-' + i, value);
}
function editorUpdateOpsi(i, idx, value) { 
  if (!editorPaket.soal[i].options) editorPaket.soal[i].options = ['','','','']; 
  editorPaket.soal[i].options[idx] = value; 
  setEditorDirty(true); 
  renderLivePreview('preview-opsi-' + i + '-' + idx, value);
}
function editorSetKunciPg(i, idx) { editorPaket.soal[i].key = idx; setEditorDirty(true); renderEditorSoal(); }
function editorToggleKunciMcma(i, idx) {
  var s = editorPaket.soal[i]; if (!Array.isArray(s.key)) s.key = [];
  var pos = s.key.indexOf(idx); if (pos >= 0) s.key.splice(pos, 1); else s.key.push(idx);
  s.key.sort(function(a, b) { return a - b; }); setEditorDirty(true); renderEditorSoal();
}
function editorUpdatePernyataan(i, idx, value) { editorPaket.soal[i].pernyataan[idx].teks = value; setEditorDirty(true); }
function editorSetBs(i, idx, val) { editorPaket.soal[i].pernyataan[idx].key = val; setEditorDirty(true); renderEditorSoal(); }
function editorTambahPernyataan(i) { editorPaket.soal[i].pernyataan.push({ teks: '', key: null }); setEditorDirty(true); renderEditorSoal(); }
function editorHapusPernyataan(i, idx) {
  var p = editorPaket.soal[i].pernyataan;
  if (p.length <= 2) { alert('Minimal 2 pernyataan'); return; }
  p.splice(idx, 1); setEditorDirty(true); renderEditorSoal();
}

function editorUbahTipe(i, newTipe) {
  var s = editorPaket.soal[i];
  if (s.tipe === newTipe) return;
  s.tipe = newTipe;
  if (newTipe === 'pg') { if (!s.options) s.options = ['','','','']; if (typeof s.key !== 'number') s.key = 0; delete s.pernyataan; }
  else if (newTipe === 'mcma') { if (!s.options) s.options = ['','','','']; if (!Array.isArray(s.key)) s.key = []; delete s.pernyataan; }
  else if (newTipe === 'bs') { if (!Array.isArray(s.pernyataan) || s.pernyataan.length < 2) s.pernyataan = [{ teks: '', key: null }, { teks: '', key: null }]; delete s.options; delete s.key; delete s.optionImgs; }
  setEditorDirty(true); renderEditorSoal();
}

function editorTambahSoal() {
  var newId = editorPaket.id + '-s' + (editorPaket.soal.length + 1) + '-' + Date.now();
  editorPaket.soal.push({ id: newId, tipe: 'pg', q: '', options: ['','','',''], key: 0 });
  setEditorDirty(true); renderEditorSoal();
  setTimeout(function() { var cards = document.querySelectorAll('#editorSoalList .card'); if (cards.length) cards[cards.length - 1].scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 100);
}

async function editorDuplikatSoal(i) {
  var asli = JSON.parse(JSON.stringify(editorPaket.soal[i]));
  asli.id = editorPaket.id + '-s' + (editorPaket.soal.length + 1) + '-' + Date.now();
  editorPaket.soal.splice(i + 1, 0, asli);
  setEditorDirty(true); renderEditorSoal();
}

async function editorHapusSoal(i) { if (!await swalConfirm('Hapus soal #' + (i + 1) + '?')) return; editorPaket.soal.splice(i, 1); setEditorDirty(true); renderEditorSoal(); }

function editorHapusGambar(soalIdx, field) {
  if (field === 'img') delete editorPaket.soal[soalIdx].img;
  else if (field.startsWith('optionImgs.')) { var idx = parseInt(field.split('.')[1]); if (editorPaket.soal[soalIdx].optionImgs) editorPaket.soal[soalIdx].optionImgs[idx] = null; }
  setEditorDirty(true); renderEditorSoal();
}

async function openImagePicker(soalIdx, field) {
  activeImageTarget = { soalIdx: soalIdx, field: field };
  const targetLabel = field === 'img' ? 'Gambar soal' : 'Opsi ' + ['A','B','C','D'][parseInt(field.split('.')[1])];
  document.getElementById('imagePickerTarget').textContent = 'Untuk: Soal #' + (soalIdx + 1) + ' — ' + targetLabel;
  document.getElementById('imagePickerModal').style.display = 'flex';
  document.getElementById('pickerUploadInfo').textContent = '';
  await renderPickerImages();
}

async function renderPickerImages() {
  var list = document.getElementById('imagePickerList');
  list.innerHTML = '<p class="muted" style="grid-column:1/-1;text-align:center">Memuat...</p>';
  try {
    var r = await fetch('/api/teacher/gambar');
    var files = await r.json();
    if (!files.length) { list.innerHTML = '<p class="muted" style="grid-column:1/-1;text-align:center">Belum ada gambar.<br>Klik "Upload Baru" atau paste gambar (Ctrl+V).</p>'; return; }
    list.innerHTML = files.map(function(f) {
      return '<div class="gambar-item" style="cursor:pointer" onclick="pilihGambar(\'' + f.nama.replace(/'/g, "\\'") + '\')"><img src="' + f.url + '" alt=""><div class="gambar-nama">' + escapeHtml(f.nama) + '</div></div>';
    }).join('');
  } catch (e) { list.innerHTML = '<p class="muted" style="grid-column:1/-1;text-align:center">Gagal memuat: ' + e.message + '</p>'; }
}

function pilihGambar(nama) {
  if (!activeImageTarget) return;
  var t = activeImageTarget;
  var s = editorPaket.soal[t.soalIdx];
  if (t.field === 'img') { s.img = nama; }
  else if (t.field.startsWith('optionImgs.')) { var idx = parseInt(t.field.split('.')[1]); if (!s.optionImgs) s.optionImgs = [null, null, null, null]; s.optionImgs[idx] = nama; }
  closeImagePicker(); setEditorDirty(true); renderEditorSoal();
}

function hapusGambarDariTarget() {
  if (!activeImageTarget) return;
  var t = activeImageTarget;
  var s = editorPaket.soal[t.soalIdx];
  if (t.field === 'img') delete s.img;
  else if (t.field.startsWith('optionImgs.')) { var idx = parseInt(t.field.split('.')[1]); if (s.optionImgs) s.optionImgs[idx] = null; }
  closeImagePicker(); setEditorDirty(true); renderEditorSoal();
}

function closeImagePicker() { document.getElementById('imagePickerModal').style.display = 'none'; activeImageTarget = null; }

async function uploadDariPicker(input) {
  if (!input.files || !input.files.length) return;
  const file = input.files[0]; input.value = ''; await uploadFileKeServer(file);
}

async function uploadFileKeServer(file) {
  const info = document.getElementById('pickerUploadInfo');
  info.textContent = 'Mengupload...';
  const fd = new FormData(); fd.append('files', file);
  try {
    const r = await fetch('/api/teacher/upload-gambar', { method: 'POST', body: fd });
    const d = await r.json();
    if (!r.ok) { info.textContent = 'Gagal: ' + (d.error || 'tidak diketahui'); return; }
    if (d.files && d.files.length) { info.textContent = 'Berhasil upload: ' + d.files[0].nama; pilihGambar(d.files[0].nama); }
  } catch (e) { info.textContent = 'Gagal: ' + e.message; }
}

function pasteGambarManual() { Swal.fire({ icon: 'info', title: 'Paste Gambar', html: 'Tekan <b>Ctrl+V</b> (atau Cmd+V di Mac) sekarang.<br><br>Screenshot atau copy gambar dulu, lalu paste.', confirmButtonText: 'Mengerti', confirmButtonColor: '#1e40af' }); }

document.addEventListener('paste', async function(e) {
  const picker = document.getElementById('imagePickerModal');
  if (!picker || picker.style.display !== 'flex') return;
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  for (const item of items) {
    if (item.type && item.type.startsWith('image/')) {
      e.preventDefault(); const file = item.getAsFile(); if (file) await uploadFileKeServer(file); return;
    }
  }
});

function initImagePickerDropzone() {
  const list = document.getElementById('imagePickerList');
  if (!list) return;
  ['dragenter', 'dragover'].forEach(function(evt) { list.addEventListener(evt, function(e) { e.preventDefault(); e.stopPropagation(); list.style.background = '#dbeafe'; list.style.borderColor = '#1e40af'; }); });
  ['dragleave', 'drop'].forEach(function(evt) { list.addEventListener(evt, function(e) { e.preventDefault(); e.stopPropagation(); list.style.background = ''; list.style.borderColor = '#e2e8f0'; }); });
  list.addEventListener('drop', async function(e) {
    const files = e.dataTransfer && e.dataTransfer.files;
    if (!files || !files.length) return;
    const file = files[0];
    if (!file.type.startsWith('image/')) { await swalError('File bukan gambar'); return; }
    await uploadFileKeServer(file);
  });
}

async function editorSimpan() {
  editorPaket.judul = document.getElementById('editorJudul').value.trim();
  editorPaket.mapel = document.getElementById('editorMapel').value.trim();
  editorPaket.durasiMenit = parseInt(document.getElementById('editorDurasi').value) || 15;
  editorPaket.acakMode = document.getElementById('editorAcakMode').value || 'per-tipe';
  if (!editorPaket.judul) { await swalError('Judul wajib diisi'); return; }
  swalLoading('Menyimpan...');
  try {
    var r = await fetch('/api/teacher/paket/' + editorPaket.id, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editorPaket)
    });
    var d = await r.json();
    Swal.close();
    if (!r.ok) { await swalError(d.error || 'Gagal simpan'); return; }
    editorDirty = false; editorClearDraft(); updateEditorHeader();
    await swalSuccess('Paket tersimpan: ' + d.jumlahSoal + ' soal');
    await loadPaket();
  } catch (e) { Swal.close(); await swalError(e.message); }
}

function editorPreview() {
  if (!editorPaket) return;
  var items = editorPaket.soal.map(function(s, i) { return renderPreviewSoal(s, i); }).join('');
  Swal.fire({ 
    title: escapeHtml(editorPaket.judul) + ' — ' + escapeHtml(editorPaket.mapel), 
    html: '<div style="font-size:13px;color:#64748b;margin-bottom:12px">' + editorPaket.soal.length + ' soal / ' + editorPaket.durasiMenit + ' menit (belum disimpan)</div>' + items, 
    width: '850px', 
    showCloseButton: true, 
    showConfirmButton: false, 
    showCancelButton: true, 
    cancelButtonText: 'Tutup', 
    cancelButtonColor: '#64748b',
    didOpen: function() {
      if (window.renderMathInElement) {
        renderMathInElement(document.querySelector('.swal2-html-container'), { delimiters: [{left: '$$', right: '$$', display: true}, {left: '$', right: '$', display: false}], throwOnError: false });
      }
    }
  });
}

function renderPreviewSoal(s, i) {
  var tipe = s.tipe || 'pg';
  var imgHtml = s.img ? '<img src="/gambar/' + encodeURIComponent(s.img) + '" style="display:block;max-width:100%;max-height:200px;margin:8px auto;border-radius:4px">' : '';
  var body = '';
  if (tipe === 'bs') {
    body = '<table style="width:100%;border-collapse:collapse;margin:8px 0;border:1px solid #e2e8f0"><thead><tr style="background:#f1f5f9"><th style="padding:6px;text-align:left;font-size:12px">Pernyataan</th><th style="padding:6px;width:50px;text-align:center;font-size:12px">Kunci</th></tr></thead><tbody>';
    (s.pernyataan || []).forEach(function(p) { body += '<tr><td style="padding:6px;border-top:1px solid #e2e8f0;font-size:13px">' + escapeHtml(p.teks) + '</td><td style="padding:6px;border-top:1px solid #e2e8f0;text-align:center;font-weight:700">' + (p.key === true ? 'B' : p.key === false ? 'S' : '—') + '</td></tr>'; });
    body += '</tbody></table>';
  } else {
    var kunciArr = tipe === 'mcma' ? (Array.isArray(s.key) ? s.key : []) : [s.key];
    body = (s.options || []).map(function(o, idx) {
      var isK = kunciArr.indexOf(idx) >= 0;
      var oi = (s.optionImgs && s.optionImgs[idx]) ? '<img src="/gambar/' + encodeURIComponent(s.optionImgs[idx]) + '" style="display:block;max-width:100%;max-height:80px;margin-top:4px;border-radius:3px">' : '';
      return '<div style="padding:8px 12px;border-radius:4px;margin:4px 0;border:1px solid ' + (isK ? '#86efac' : '#e2e8f0') + ';background:' + (isK ? '#d1fae5' : '#f8fafc') + '"><b>' + String.fromCharCode(65 + idx) + '.</b> ' + escapeHtml(o || '') + (isK ? ' <b style="color:#047857">[KUNCI]</b>' : '') + oi + '</div>';
    }).join('');
  }
  var tipeBadge = '<span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:700">' + tipe.toUpperCase() + '</span>';
  var pemb = s.pembahasan ? '<div style="margin-top:8px;padding:8px;background:#f1f5f9;border-radius:4px;font-size:12px"><b>Pembahasan:</b> ' + escapeHtml(s.pembahasan) + '</div>' : '';
  return '<div style="border:1px solid #e2e8f0;border-radius:4px;padding:12px;margin-bottom:10px;text-align:left"><div style="margin-bottom:6px;font-size:13px"><b>' + (i + 1) + '.</b> ' + tipeBadge + ' ' + escapeHtml(s.q || '(kosong)') + '</div>' + imgHtml + body + pemb + '</div>';
}

document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    const sec = document.getElementById('section-editor');
    if (sec && sec.classList.contains('active') && editorPaket) { e.preventDefault(); editorSimpan(); }
  }
  if (e.key === 'Escape') { const m = document.getElementById('imagePickerModal'); if (m && m.style.display === 'flex') closeImagePicker(); }
});
window.addEventListener('beforeunload', function(e) { if (editorDirty) { e.preventDefault(); e.returnValue = ''; } });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initImagePickerDropzone); else initImagePickerDropzone();
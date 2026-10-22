// ============================================================
// guru-siswa.js — v18.29 (Redesign)
// ============================================================

var siswaCache = [];
var siswaFilterState = { search: '', kelas: 'all' };

async function loadSiswaPanel() {
  await loadSiswa();
  await loadSettingWajib();
  await refreshKehadiran();
}

async function loadSiswa() {
  try {
    var r = await fetch('/api/teacher/siswa');
    siswaCache = await r.json();
    updateSiswaStats();
    updateKelasFilter();
    renderSiswaTable();
  } catch (e) { console.error(e); }
}

function updateSiswaStats() {
  var el = document.getElementById('siswaStats');
  if (!el) return;
  var total = siswaCache.length;
  var kelasSet = new Set();
  siswaCache.forEach(function(s) { if (s.kelas) kelasSet.add(s.kelas); });
  
  if (total === 0) {
    el.textContent = 'Belum ada data siswa';
  } else {
    el.textContent = total + ' siswa · ' + kelasSet.size + ' kelas';
  }
}

function updateKelasFilter() {
  var sel = document.getElementById('siswaKelasFilter');
  if (!sel) return;
  var kelasSet = new Set();
  siswaCache.forEach(function(s) { if (s.kelas) kelasSet.add(s.kelas); });
  var kelasArr = Array.from(kelasSet).sort();
  
  var current = sel.value;
  var html = '<option value="all">Semua Kelas</option>';
  kelasArr.forEach(function(k) {
    html += '<option value="' + escapeHtml(k) + '">' + escapeHtml(k) + '</option>';
  });
  sel.innerHTML = html;
  if (kelasArr.indexOf(current) !== -1 || current === 'all') sel.value = current;
}

function onSiswaFilterChange() {
  siswaFilterState.search = ((document.getElementById('siswaSearch') || {}).value || '').toLowerCase().trim();
  siswaFilterState.kelas = (document.getElementById('siswaKelasFilter') || {}).value || 'all';
  renderSiswaTable();
}

function renderSiswaTable() {
  var tbody = document.getElementById('siswaTable');
  if (!tbody) return;
  
  var filtered = siswaCache.filter(function(s) {
    if (siswaFilterState.kelas !== 'all' && s.kelas !== siswaFilterState.kelas) return false;
    if (siswaFilterState.search) {
      var matchNama = (s.nama || '').toLowerCase().indexOf(siswaFilterState.search) !== -1;
      var matchNisn = (s.nisn || '').toLowerCase().indexOf(siswaFilterState.search) !== -1;
      if (!matchNama && !matchNisn) return false;
    }
    return true;
  });
  
  if (filtered.length === 0) {
    var msg = siswaCache.length === 0 ? 'Belum ada siswa. Silakan import CSV atau tambah manual.' : 'Tidak ada siswa yang cocok.';
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">' + msg + '</td></tr>';
    return;
  }
  
  tbody.innerHTML = filtered.map(function(s, i) {
    var isAktif = s.aktif !== 0;
    var statusBadge = isAktif 
      ? '<span class="badge badge-ok" style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:4px;font-size:11px">Aktif</span>'
      : '<span class="badge" style="background:#f1f5f9;color:#64748b;padding:2px 8px;border-radius:4px;font-size:11px">Nonaktif</span>';
    var btnToggle = isAktif
      ? '<button class="btn-icon" onclick="toggleAktifSiswa(' + s.id + ', 0)" title="Nonaktifkan (tidak ikut ujian)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg></button>'
      : '<button class="btn-icon" onclick="toggleAktifSiswa(' + s.id + ', 1)" title="Aktifkan kembali" style="color:#059669"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></button>';
      
    return '<tr style="' + (!isAktif ? 'opacity:0.6;background:#f8fafc' : '') + '">' +
      '<td>' + (i + 1) + '</td>' +
      '<td style="font-family:monospace;color:var(--g600)">' + escapeHtml(s.nisn || '-') + '</td>' +
      '<td><b>' + escapeHtml(s.nama) + '</b></td>' +
      '<td>' + escapeHtml(s.kelas || '-') + '</td>' +
      '<td>' + statusBadge + '</td>' +
      '<td style="text-align:center;white-space:nowrap">' +
        '<button class="btn-icon" onclick="editSiswa(' + s.id + ')" title="Edit data"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>' +
        btnToggle +
        '<button class="btn-icon" onclick="hapusSiswa(' + s.id + ',\'' + (s.nama || '').replace(/'/g, "\\'") + '\')" title="Hapus permanen"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>' +
      '</td>' +
    '</tr>';
  }).join('');
}

async function loadSettingWajib() {
  try {
    var r = await fetch('/api/teacher/settings');
    var d = await r.json();
    var toggle = document.getElementById('wajibSiswaToggle');
    var banner = document.getElementById('validasiBanner');
    var desc = document.getElementById('validasiDesc');
    if (toggle) toggle.checked = !!d.wajibSiswaTerdaftar;
    
    if (d.wajibSiswaTerdaftar) {
      if (banner) banner.classList.add('active');
      if (desc) desc.textContent = 'AKTIF - Siswa hanya bisa login jika Nama/NISN terdaftar di bawah.';
    } else {
      if (banner) banner.classList.remove('active');
      if (desc) desc.textContent = 'NONAKTIF - Siapa pun dengan token bisa masuk ujian.';
    }
  } catch (e) {}
}

async function toggleWajibSiswa() {
  var aktif = document.getElementById('wajibSiswaToggle').checked;
  try {
    var r = await fetch('/api/teacher/toggle-wajib-siswa', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aktif: aktif })
    });
    var d = await r.json();
    if (d.ok) {
      await swalSuccess(aktif ? 'Validasi login AKTIF.' : 'Validasi login DIMATIKAN.');
      await loadSettingWajib();
    } else {
      await swalError(d.error || 'Gagal');
      document.getElementById('wajibSiswaToggle').checked = !aktif;
    }
  } catch (e) {
    await swalError(e.message); document.getElementById('wajibSiswaToggle').checked = !aktif;
  }
}

async function refreshKehadiran() {
  try {
    var r = await fetch('/api/teacher/live');
    var d = await r.json();
    var metrics = document.getElementById('siswaMetrics');
    if (!metrics) return;
    
    if (!d.aktif) {
      metrics.style.display = 'none';
      return;
    }
    metrics.style.display = 'grid';
    var totalTerdaftar = d.totalTerdaftar || 0;
    var belumMasuk = (d.belumMasuk || []).length;
    var sudahMasuk = Math.max(0, totalTerdaftar - belumMasuk);
    
    document.getElementById('mTerdaftar').textContent = totalTerdaftar;
    document.getElementById('mTerdaftarSub').textContent = 'siswa';
    document.getElementById('mSudahMasuk').textContent = sudahMasuk;
    document.getElementById('mSudahMasukSub').textContent = totalTerdaftar > 0 ? Math.round(sudahMasuk / totalTerdaftar * 100) + '% hadir' : '—';
    document.getElementById('mBelumMasuk').textContent = belumMasuk;
    document.getElementById('mBelumMasukSub').textContent = belumMasuk > 0 ? 'belum join' : '—';
  } catch (e) { console.error(e); }
}

// ============ MODAL & IMPORT ============
function bukaModalImportSiswa() {
  document.getElementById('csvSiswaFile').value = '';
  document.getElementById('importSiswaInfo').textContent = '';
  document.getElementById('modalImportSiswa').style.display = 'flex';
}

function tutupModalImportSiswa() {
  document.getElementById('modalImportSiswa').style.display = 'none';
}

async function importSiswaCSV() {
  var file = document.getElementById('csvSiswaFile').files[0];
  var info = document.getElementById('importSiswaInfo');
  if (!file) { await swalInfo('Pilih file CSV dulu'); return; }
  var mode = document.getElementById('importSiswaMode').value;
  
  if (mode === 'replace') {
    if (!await swalConfirm('Ganti SEMUA data siswa dengan isi file ini? Data lama akan hilang.', 'Konfirmasi Replace')) return;
  }
  
  info.textContent = 'Mengimpor...';
  var csv = await file.text();
  try {
    var r = await fetch('/api/teacher/import-siswa-csv', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv: csv, mode: mode })
    });
    var d = await r.json();
    if (!r.ok) { info.textContent = ''; await swalError(d.error || 'Gagal import'); return; }
    
    info.textContent = 'Berhasil: ' + d.ditambahkan + ' siswa ditambahkan.';
    await swalSuccess(d.ditambahkan + ' siswa diimpor. Total sekarang: ' + d.total + ' siswa.');
    await loadSiswa();
    await refreshKehadiran();
    setTimeout(tutupModalImportSiswa, 1000);
  } catch (e) {
    info.textContent = ''; await swalError(e.message);
  }
}

function downloadTemplateSiswa() { window.open('/api/teacher/template-siswa-csv', '_blank'); }

async function hapusSiswa(id, nama) {
  if (!await swalConfirm('Hapus "' + nama + '" dari daftar siswa?', 'Hapus Siswa')) return;
  try {
    var r = await fetch('/api/teacher/hapus-siswa', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id })
    });
    var d = await r.json();
    if (!d.ok) { await swalError(d.error || 'Gagal'); return; }
    await loadSiswa();
    await refreshKehadiran();
  } catch (e) { await swalError(e.message); }
}

async function clearSemuaSiswa() {
  if (siswaCache.length === 0) { await swalInfo('Data siswa sudah kosong.'); return; }
  if (!await swalConfirm('Hapus SEMUA (' + siswaCache.length + ') siswa dari daftar? Tindakan ini tidak bisa dibatalkan.', 'Hapus Semua')) return;
  if (!await swalConfirm('Konfirmasi terakhir: seluruh data siswa akan dihapus permanen.', 'Yakin 100%?')) return;
  
  try {
    var r = await fetch('/api/teacher/clear-siswa', { method: 'POST' });
    var d = await r.json();
    if (!d.ok) { await swalError(d.error || 'Gagal'); return; }
    await swalSuccess('Semua siswa dihapus');
    await loadSiswa();
    await refreshKehadiran();
  } catch (e) { await swalError(e.message); }
}


// ============ TAMBAH/EDIT SISWA ============
function bukaModalSiswa(id) {
  document.getElementById('formSiswaId').value = '';
  document.getElementById('formSiswaNama').value = '';
  document.getElementById('formSiswaNisn').value = '';
  document.getElementById('formSiswaKelas').value = '';
  document.getElementById('formSiswaInfo').textContent = '';
  document.getElementById('modalSiswaTitle').textContent = 'Tambah Siswa';
  document.getElementById('modalSiswa').style.display = 'flex';
  document.getElementById('formSiswaNama').focus();
}

function editSiswa(id) {
  var s = siswaCache.find(function(x) { return x.id === id; });
  if (!s) return;
  document.getElementById('formSiswaId').value = s.id;
  document.getElementById('formSiswaNama').value = s.nama || '';
  document.getElementById('formSiswaNisn').value = s.nisn || '';
  document.getElementById('formSiswaKelas').value = s.kelas || '';
  document.getElementById('formSiswaInfo').textContent = '';
  document.getElementById('modalSiswaTitle').textContent = 'Edit Data Siswa';
  document.getElementById('modalSiswa').style.display = 'flex';
  document.getElementById('formSiswaNama').focus();
}

function tutupModalSiswa() {
  document.getElementById('modalSiswa').style.display = 'none';
}

async function simpanSiswa() {
  var id = document.getElementById('formSiswaId').value;
  var nama = document.getElementById('formSiswaNama').value.trim();
  var nisn = document.getElementById('formSiswaNisn').value.trim();
  var kelas = document.getElementById('formSiswaKelas').value.trim();
  var info = document.getElementById('formSiswaInfo');
  
  if (!nama) { info.textContent = 'Nama wajib diisi'; info.style.color = '#dc2626'; return; }
  
  info.textContent = 'Menyimpan...'; info.style.color = '#64748b';
  try {
    var r = await fetch('/api/teacher/siswa/save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id || null, nama: nama, nisn: nisn, kelas: kelas })
    });
    var d = await r.json();
    if (!r.ok) { info.textContent = d.error || 'Gagal'; info.style.color = '#dc2626'; return; }
    
    await swalSuccess('Data siswa tersimpan');
    tutupModalSiswa();
    await loadSiswa();
    await refreshKehadiran();
  } catch (e) { info.textContent = e.message; info.style.color = '#dc2626'; }
}

async function toggleAktifSiswa(id, newAktif) {
  var label = newAktif ? 'mengaktifkan' : 'menonaktifkan';
  if (!await swalConfirm('Yakin ' + label + ' siswa ini?', 'Konfirmasi')) return;
  try {
    await fetch('/api/teacher/toggle-siswa-aktif', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id, aktif: newAktif })
    });
    await loadSiswa();
  } catch (e) { await swalError(e.message); }
}

// ============ INIT ============
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(loadSiswaPanel, 500);
});
setInterval(function() {
  var sec = document.getElementById('section-siswa');
  if (sec && sec.classList.contains('active')) refreshKehadiran();
}, 5000);

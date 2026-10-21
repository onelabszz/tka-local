// ============================================================
// guru-siswa.js — v14
// ============================================================

async function loadSiswaPanel() {
  await loadSiswa();
  await loadSettingWajib();
  await refreshKehadiran();
}

async function loadSiswa() {
  try {
    const r = await fetch('/api/teacher/siswa');
    const list = await r.json();
    document.getElementById('siswaCount').textContent = '(' + list.length + ' siswa)';
    const tbody = document.getElementById('siswaTable');
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="muted" style="text-align:center;padding:36px">Belum ada siswa. Import CSV untuk menambahkan.</td></tr>';
      return;
    }
    tbody.innerHTML = list.map(function(s, i) {
      return '<tr>' +
        '<td>' + (i + 1) + '</td>' +
        '<td>' + escapeHtml(s.nisn || '-') + '</td>' +
        '<td><b>' + escapeHtml(s.nama) + '</b></td>' +
        '<td>' + escapeHtml(s.kelas || '-') + '</td>' +
        '<td><button class="btn btn-danger btn-sm" onclick="hapusSiswa(' + s.id + ',\'' + (s.nama || '').replace(/'/g, "\\'") + '\')">Hapus</button></td>' +
        '</tr>';
    }).join('');
  } catch (e) { console.error(e); }
}

async function loadSettingWajib() {
  try {
    const r = await fetch('/api/teacher/settings');
    const d = await r.json();
    document.getElementById('wajibSiswaToggle').checked = !!d.wajibSiswaTerdaftar;
  } catch (e) {}
}

async function toggleWajibSiswa() {
  const aktif = document.getElementById('wajibSiswaToggle').checked;
  try {
    const r = await fetch('/api/teacher/toggle-wajib-siswa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aktif: aktif })
    });
    const d = await r.json();
    if (d.ok) {
      await swalSuccess(aktif
        ? 'Validasi aktif — siswa harus terdaftar untuk join ujian.'
        : 'Validasi dimatikan — siapa pun dengan token bisa join.');
    } else {
      await swalError(d.error || 'Gagal');
      document.getElementById('wajibSiswaToggle').checked = !aktif;
    }
  } catch (e) {
    await swalError(e.message);
    document.getElementById('wajibSiswaToggle').checked = !aktif;
  }
}

async function refreshKehadiran() {
  try {
    const r = await fetch('/api/teacher/live');
    const d = await r.json();
    const metrics = document.getElementById('siswaMetrics');
    if (!d.aktif) {
      metrics.style.display = 'none';
      return;
    }
    metrics.style.display = 'grid';
    const totalTerdaftar = d.totalTerdaftar || 0;
    const belumMasuk = (d.belumMasuk || []).length;
    const sudahMasuk = Math.max(0, totalTerdaftar - belumMasuk);

    document.getElementById('mTerdaftar').textContent = totalTerdaftar;
    document.getElementById('mTerdaftarSub').textContent = totalTerdaftar > 0 ? 'siswa' : 'Belum ada data';
    document.getElementById('mSudahMasuk').textContent = sudahMasuk;
    document.getElementById('mSudahMasukSub').textContent = totalTerdaftar > 0
      ? Math.round(sudahMasuk / totalTerdaftar * 100) + '% hadir' : '—';
    document.getElementById('mBelumMasuk').textContent = belumMasuk;
    document.getElementById('mBelumMasukSub').textContent = belumMasuk > 0 ? 'belum join' : '—';
  } catch (e) { console.error(e); }
}

async function importSiswaCSV() {
  const file = document.getElementById('csvSiswaFile').files[0];
  const info = document.getElementById('importSiswaInfo');
  if (!file) { await swalInfo('Pilih file Excel (.xlsx) dulu'); return; }
  const mode = document.getElementById('importSiswaMode').value;
  if (mode === 'replace') {
    if (!await swalConfirm('Ganti SEMUA data siswa dengan isi file ini? Data lama akan hilang.', 'Konfirmasi Replace')) return;
  }
  info.textContent = 'Membaca file Excel...';
  const reader = new FileReader();
  reader.onload = async (e) => {
    const base64 = e.target.result.split(',')[1];
    info.textContent = 'Mengimpor…';
    try {
      const r = await fetch('/api/teacher/import-siswa-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64: base64, mode: mode })
      });
      const d = await r.json();
      if (!r.ok) { info.textContent = ''; await swalError(d.error || 'Gagal import', 'Import Gagal'); return; }
      info.textContent = 'Berhasil: ' + d.ditambahkan + ' siswa ditambahkan. Total: ' + d.total;
      document.getElementById('csvSiswaFile').value = '';
      await swalSuccess(d.ditambahkan + ' siswa diimpor. Total sekarang: ' + d.total + ' siswa.');
      await loadSiswa(); await loadSiswaPanel();
    } catch (err) { info.textContent = ''; await swalError(err.message); }
  };
  reader.readAsDataURL(file);
}

}
}

async function refreshKehadiran() {
  try {
    const r = await fetch('/api/teacher/live');
    const d = await r.json();
    const metrics = document.getElementById('siswaMetrics');
    if (!d.aktif) {
      metrics.style.display = 'none';
      return;
    }
    metrics.style.display = 'grid';
    const totalTerdaftar = d.totalTerdaftar || 0;
    const belumMasuk = (d.belumMasuk || []).length;
    const sudahMasuk = Math.max(0, totalTerdaftar - belumMasuk);

    document.getElementById('mTerdaftar').textContent = totalTerdaftar;
    document.getElementById('mTerdaftarSub').textContent = totalTerdaftar > 0 ? 'siswa' : 'Belum ada data';
    document.getElementById('mSudahMasuk').textContent = sudahMasuk;
    document.getElementById('mSudahMasukSub').textContent = totalTerdaftar > 0
      ? Math.round(sudahMasuk / totalTerdaftar * 100) + '% hadir' : '—';
    document.getElementById('mBelumMasuk').textContent = belumMasuk;
    document.getElementById('mBelumMasukSub').textContent = belumMasuk > 0 ? 'belum join' : '—';
  } catch (e) { console.error(e); }
}

async function importSiswaCSV() {
  const file = document.getElementById('csvSiswaFile').files[0];
  const info = document.getElementById('importSiswaInfo');
  if (!file) { await swalInfo('Pilih file CSV dulu'); return; }
  const mode = document.getElementById('importSiswaMode').value;
  if (mode === 'replace') {
    if (!await swalConfirm('Ganti SEMUA data siswa dengan isi CSV ini? Data lama akan hilang.', 'Konfirmasi Replace')) return;
  }
  info.textContent = 'Mengimpor…';
  const csv = await file.text();
  try {
    const r = await fetch('/api/teacher/import-siswa-csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv: csv, mode: mode })
    });
    const d = await r.json();
    if (!r.ok) { info.textContent = ''; await swalError(d.error || 'Gagal import', 'Import Gagal'); return; }
    info.textContent = 'Berhasil: ' + d.ditambahkan + ' siswa ditambahkan. Total: ' + d.total;
    document.getElementById('csvSiswaFile').value = '';
    await swalSuccess(d.ditambahkan + ' siswa diimpor.\nTotal sekarang: ' + d.total + ' siswa.');
    await loadSiswa();
    await refreshKehadiran();
  } catch (e) { info.textContent = ''; await swalError(e.message); }
}

function downloadTemplateSiswa() {
  window.open('/api/teacher/template-siswa-csv', '_blank');
}

async function hapusSiswa(id, nama) {
  if (!await swalConfirm('Hapus "' + nama + '" dari daftar siswa?', 'Hapus Siswa')) return;
  try {
    const r = await fetch('/api/teacher/hapus-siswa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id })
    });
    const d = await r.json();
    if (!d.ok) { await swalError(d.error || 'Gagal'); return; }
    await loadSiswa();
    await refreshKehadiran();
  } catch (e) { await swalError(e.message); }
}

async function clearSemuaSiswa() {
  if (!await swalConfirm('Hapus SEMUA siswa dari daftar? Tindakan ini tidak bisa dibatalkan.', 'Hapus Semua')) return;
  if (!await swalConfirm('Konfirmasi terakhir: seluruh data siswa akan dihapus.', 'Yakin?')) return;
  try {
    const r = await fetch('/api/teacher/clear-siswa', { method: 'POST' });
    const d = await r.json();
    if (!d.ok) { await swalError(d.error || 'Gagal'); return; }
    await swalSuccess('Semua siswa dihapus');
    await loadSiswa();
    await refreshKehadiran();
  } catch (e) { await swalError(e.message); }
}

// Preload saat halaman siap
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(loadSiswaPanel, 500);
});

// Poll kehadiran saat section aktif
setInterval(function() {
  const sec = document.getElementById('section-siswa');
  if (sec && sec.classList.contains('active')) refreshKehadiran();
}, 5000);

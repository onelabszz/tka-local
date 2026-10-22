// ============================================================
// guru-profil.js — v18.21 (defensive)
// ============================================================

function safeGet(id) { return document.getElementById(id); }
function safeSetVal(id, val) { var el = safeGet(id); if (el) el.value = val; }
function safeText(id, val) { var el = safeGet(id); if (el) el.textContent = val || '—'; }

async function loadProfilSekolah() {
  try {
    var r = await fetch('/api/teacher/sekolah');
    var d = await r.json();
    window.currentSekolahData = d;
    updateProfilView(d);
    updateBrandSidebar(d);
  } catch (e) { console.error('Gagal load profil:', e); }
}

function updateProfilView(d) {
  safeText('profilNama', d.nama || 'Belum diisi');
  safeText('profilNpsn', d.npsn ? 'NPSN: ' + d.npsn : 'NPSN: —');
  safeText('profilAlamat', d.alamat);
  safeText('profilKepsek', d.kepsek ? 'Kepala Sekolah: ' + d.kepsek : 'Kepala Sekolah: —');
  safeText('profilNip', d.nip ? 'NIP: ' + d.nip : 'NIP: —');
  safeText('profilTA', d.tahun_ajaran);
  safeText('profilTelp', d.telepon);
  safeText('profilEmail', d.email);
  safeText('profilWebsite', d.website);
  safeText('profilNamaKegiatan', d.nama_kegiatan || 'Tryout TKA Mandiri');

  var img = safeGet('profilLogo');
  var empty = safeGet('profilLogoEmpty');
  if (img && empty) {
    if (d.logo) {
      img.src = '/logo-sekolah?t=' + Date.now();
      img.style.display = 'block';
      empty.style.display = 'none';
    } else {
      img.style.display = 'none';
      empty.style.display = 'block';
    }
  }
}

function updateBrandSidebar(d) {
  var nama = safeGet('brandSekolahNama');
  var npsn = safeGet('brandSekolahNpsn');
  if (nama) nama.textContent = d.nama || 'Dashboard Guru';
  if (npsn) npsn.textContent = d.npsn ? 'NPSN: ' + d.npsn : 'Belum diatur';
}

function editProfilSekolah() {
  fetch('/api/teacher/sekolah').then(function(r) { return r.json(); }).then(function(d) {
    safeSetVal('editNama', d.nama || '');
    safeSetVal('editNpsn', d.npsn || '');
    safeSetVal('editAlamat', d.alamat || '');
    safeSetVal('editTA', d.tahun_ajaran || '');
    safeSetVal('editKepsek', d.kepsek || '');
    safeSetVal('editNip', d.nip || '');
    safeSetVal('editTelp', d.telepon || '');
    safeSetVal('editEmail', d.email || '');
    safeSetVal('editWebsite', d.website || '');
    safeSetVal('editNamaKegiatan', d.nama_kegiatan || 'Tryout TKA Mandiri');
    safeSetVal('logoUpload', '');
    var v = safeGet('profilView'); if (v) v.style.display = 'none';
    var f = safeGet('profilForm'); if (f) f.style.display = 'block';
  });
}

function batalEditProfil() {
  var f = safeGet('profilForm'); if (f) f.style.display = 'none';
  var v = safeGet('profilView'); if (v) v.style.display = 'block';
}

async function simpanProfilSekolah() {
  var namaEl = safeGet('editNama');
  var npsnEl = safeGet('editNpsn');
  var nama = (namaEl ? namaEl.value : '').trim();
  var npsn = (npsnEl ? npsnEl.value : '').trim();
  if (nama.length < 3) { await swalError('Nama sekolah minimal 3 karakter'); return; }
  if (!/^\d{8}$/.test(npsn)) { await swalError('NPSN harus 8 digit angka'); return; }

  function getVal(id) { var el = safeGet(id); return el ? el.value.trim() : ''; }

  var data = {
    nama: nama,
    npsn: npsn,
    alamat: getVal('editAlamat'),
    tahun_ajaran: getVal('editTA'),
    kepsek: getVal('editKepsek'),
    nip: getVal('editNip'),
    telepon: getVal('editTelp'),
    email: getVal('editEmail'),
    website: getVal('editWebsite'),
    nama_kegiatan: getVal('editNamaKegiatan') || 'Tryout TKA Mandiri'
  };

  try {
    var r = await fetch('/api/teacher/sekolah', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!r.ok) throw new Error('Gagal simpan');

    var logoInput = safeGet('logoUpload');
    if (logoInput && logoInput.files && logoInput.files[0]) {
      var logoFile = logoInput.files[0];
      if (logoFile.size > 500 * 1024) {
        await swalError('Logo maks 500 KB');
        return;
      }
      var fd = new FormData();
      fd.append('logo', logoFile);
      await fetch('/api/teacher/upload-logo', { method: 'POST', body: fd });
    }

    await swalSuccess('Profil sekolah tersimpan');
    batalEditProfil();
    await loadProfilSekolah();
  } catch (e) {
    await swalError(e.message);
  }
}

document.addEventListener('DOMContentLoaded', function() {
  setTimeout(loadProfilSekolah, 300);
});

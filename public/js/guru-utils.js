function swalInfo(text, title) { return Swal.fire({ icon: 'info', title: title || 'Info', text: text }); }
function swalError(text, title) { return Swal.fire({ icon: 'error', title: title || 'Gagal', text: text }); }
function swalSuccess(text, title) { return Swal.fire({ icon: 'success', title: title || 'Berhasil', text: text }); }
async function swalConfirm(text, title) {
  const r = await Swal.fire({ icon: 'warning', title: title || 'Konfirmasi', text: text, showCancelButton: true, confirmButtonText: 'Ya, lanjutkan', cancelButtonText: 'Batal', confirmButtonColor: '#1e40af', cancelButtonColor: '#64748b' });
  return r.isConfirmed;
}
async function swalPrompt(title, defaultValue) {
  const r = await Swal.fire({ title: title, input: 'text', inputValue: defaultValue || '', showCancelButton: true, confirmButtonText: 'OK', cancelButtonText: 'Batal', confirmButtonColor: '#1e40af', cancelButtonColor: '#64748b' });
  return r.isConfirmed ? r.value : null;
}
function swalLoading(text) {
  return Swal.fire({ title: text || 'Memuat...', allowOutsideClick: false, allowEscapeKey: false, didOpen: () => Swal.showLoading() });
}
function slugify(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 60);
}
function escapeHtml(s) {
  var d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

// ============ FUNGSI BANTUAN WHATSAPP ============
function bukaWA() {
  var s = window.currentSekolahData || {};
  var template = 'Halo Tim TKA Local Host,\n\nSaya ingin melaporkan BUG / memberikan SARAN untuk aplikasi.\n\n*Sekolah*: ' + (s.nama || '(belum diisi)') + '\n*NPSN*: ' + (s.npsn || '(belum diisi)') + '\n*Versi Aplikasi*: v18.32\n\n*Kategori*: (Bug / Saran Fitur / Pertanyaan)\n*Fitur terkait*: \n*Langkah reproduksi*: \n1. \n2. \n3. \n\n*Hasil yang diharapkan*: \n*Hasil aktual*: \n*Screenshot*: (akan dikirim setelah pesan ini)\n\nTerima kasih.';
  var url = 'https://wa.me/6285647059039?text=' + encodeURIComponent(template);
  window.open(url, '_blank');
}

// ============ RESET APLIKASI ============
async function konfirmasiReset() {
  var r1 = await Swal.fire({
    icon: 'warning',
    title: 'Reset Aplikasi?',
    html: 'Tindakan ini akan menghapus <b>SEMUA DATA</b> (siswa, soal, gambar, hasil ujian, profil sekolah) dan mengembalikan aplikasi seperti baru di-install.<br><br>Sistem akan membuat <b>Backup Otomatis</b> terlebih dahulu di folder <code>backups/</code>.',
    showCancelButton: true,
    confirmButtonText: 'Ya, Lanjutkan',
    cancelButtonText: 'Batal',
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#64748b'
  });
  if (!r1.isConfirmed) return;

  var r2 = await Swal.fire({
    title: 'Ketik "RESET"',
    input: 'text',
    inputPlaceholder: 'Ketik RESET untuk konfirmasi',
    showCancelButton: true,
    confirmButtonText: 'Hapus Semua Data',
    cancelButtonText: 'Batal',
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#64748b',
    inputValidator: function(value) {
      if (value !== 'RESET') return 'Ketik persis "RESET" (huruf besar)';
    }
  });
  if (!r2.isConfirmed) return;

  Swal.fire({
    title: 'Memproses Reset...',
    text: 'Mohon tunggu sebentar.',
    allowOutsideClick: false,
    didOpen: function() { Swal.showLoading(); }
  });

  try {
    var resp = await fetch('/api/teacher/reset-system', { method: 'POST' });
    var d = await resp.json();
    if (!d.ok) throw new Error(d.error || 'Gagal mereset');
    
    await Swal.fire({
      icon: 'success',
      title: 'Reset Berhasil',
      html: 'Aplikasi telah dikembalikan ke pengaturan pabrik.<br><br><b>Server dimatikan.</b> Silakan buka kembali aplikasi TKA Local Host dari ikon di Desktop.',
      allowOutsideClick: false,
      confirmButtonText: 'Mengerti'
    });
    window.close();
  } catch (e) {
    Swal.fire('Error', e.message, 'error');
  }
}

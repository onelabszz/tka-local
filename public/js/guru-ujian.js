async function startExam() {
  var paketId = document.getElementById('paketSelect').value;
  if (!paketId) { await swalInfo('Pilih paket dulu'); return; }
  if (!await swalConfirm('Mulai ujian baru? Sesi aktif sebelumnya akan ditutup.')) return;
  var r = await fetch('/api/teacher/start', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paketId: paketId })
  });
  var d = await r.json();
  if (!r.ok) { await swalError(d.error); return; }
  document.getElementById('token').textContent = d.token;
  document.getElementById('token').classList.remove('empty');
  await swalSuccess('Ujian dimulai. Token: ' + d.token);
  var dashBadge = document.getElementById('dashStatusBadge');
  var dashText = document.getElementById('dashStatusText');
  if (dashBadge) dashBadge.classList.add('active');
  if (dashText) dashText.textContent = 'Ujian Berlangsung';
  refreshLive();
  navigate('dashboard');
}
async function stopExam() {
  if (!await swalConfirm('Hentikan sesi ujian sekarang?')) return;
  await fetch('/api/teacher/stop', { method: 'POST' });
  await swalInfo('Sesi dihentikan');
  refreshLive();
}
async function refreshLive() {
  var r = await fetch('/api/teacher/live');
  var d = await r.json();
  var status = document.getElementById('globalStatus');
  var tokenEl = document.getElementById('token');
  var sesiInfo = document.getElementById('sesiInfo');
  var cdEl = document.getElementById('countdown');
  var sidebarToken = document.getElementById('sidebarToken');
  var dashBadge = document.getElementById('dashStatusBadge');
  var dashText = document.getElementById('dashStatusText');
  if (d.aktif) {
    if (dashBadge) dashBadge.classList.add('active');
    if (dashText) dashText.textContent = 'Ujian Berlangsung';
  } else {
    if (dashBadge) dashBadge.classList.remove('active');
    if (dashText) dashText.textContent = 'Ujian Belum Aktif';
  }
  if (!d.aktif) {
    status.textContent = 'Tidak Aktif'; status.className = 'sidebar-status';
    tokenEl.textContent = '— — — —'; tokenEl.classList.add('empty');
    sesiInfo.textContent = 'Belum ada sesi aktif'; cdEl.textContent = '';
    sidebarToken.textContent = ''; sidebarToken.classList.remove('show');
    document.getElementById('rows').innerHTML = '<tr><td colspan="8" class="muted" style="text-align:center;padding:36px">Belum ada peserta</td></tr>';
    document.getElementById('autoInfo').textContent = '';
    document.getElementById('mPeserta').textContent = '0';
    document.getElementById('mSelesai').textContent = '0';
    document.getElementById('mMengerjakan').textContent = '0';
    document.getElementById('mWaktu').textContent = '—';
    return;
  }
  status.textContent = 'Berlangsung'; status.className = 'sidebar-status on';
  tokenEl.textContent = d.sesi.token; tokenEl.classList.remove('empty');
  sesiInfo.textContent = d.sesi.paketJudul + ' • ' + d.sesi.totalSoal + ' soal • ' + d.sesi.durasiMenit + ' menit';
  sidebarToken.textContent = d.sesi.token; sidebarToken.classList.add('show');
  var remain = d.sesi.deadline - Date.now();
  if (remain > 0) {
    var m = Math.floor(remain / 60000), s = Math.floor(remain % 60000 / 1000);
    cdEl.textContent = 'Sisa waktu: ' + m + ':' + (s < 10 ? '0' + s : s);
    cdEl.className = 'countdown-big' + (remain < 60000 ? ' danger' : remain < 300000 ? ' warn' : '');
    document.getElementById('mWaktu').textContent = m + ':' + (s < 10 ? '0' + s : s);
  } else {
    cdEl.textContent = 'Waktu habis'; cdEl.className = 'countdown-big danger';
    document.getElementById('mWaktu').textContent = 'Habis';
  }
  var total = d.siswa.length;
  var done = d.siswa.filter(function(x) { return x.submit_at != null; }).length;
  document.getElementById('mPeserta').textContent = total;
  document.getElementById('mPesertaSub').textContent = total > 0 ? d.sesi.paketJudul : 'Belum ada peserta';
  document.getElementById('mSelesai').textContent = done;
  document.getElementById('mSelesaiSub').textContent = total > 0 ? Math.round(done / total * 100) + '% dari peserta' : '—';
  document.getElementById('mMengerjakan').textContent = total - done;
  document.getElementById('mMengerjakanSub').textContent = total > 0 ? 'dari ' + total + ' peserta' : '—';
  document.getElementById('rows').innerHTML = d.siswa.length
    ? d.siswa.map(function(x, i) {
        var isDone = x.submit_at != null;
        var badge = isDone
          ? '<span class="badge ' + (x.auto_submit ? 'badge-auto' : 'badge-done') + '">' + (x.auto_submit ? 'Auto' : 'Selesai') + '</span>'
          : '<span class="badge badge-doing">Mengerjakan</span>';
        var warn = x.pelanggaran > 0 ? '<span class="badge badge-warn">' + x.pelanggaran + '×</span>' : '<span class="muted">—</span>';
        var reviewBtn = isDone ? '<button class="btn btn-secondary btn-sm" onclick="lihatReview(\'' + x.id + '\',\'' + (x.nama || '').replace(/'/g, "\\'") + '\')">Lihat</button> ' : '';
        return '<tr><td>' + (i + 1) + '</td><td><b>' + escapeHtml(x.nama) + '</b></td><td>' + escapeHtml(x.kelas || '-') + '</td><td>' + x.dijawab + ' / ' + d.sesi.totalSoal + '</td><td>' + (isDone ? '<b>' + x.skor + '</b> / ' + x.total : '-') + '</td><td>' + badge + '</td><td>' + warn + '</td><td><div class="table-actions">' + reviewBtn + '<button class="btn btn-danger btn-sm" onclick="hapusPeserta(\'' + x.id + '\',\'' + (x.nama || '').replace(/'/g, "\\'") + '\')">Hapus</button></div></td></tr>';
      }).join('')
    : '<tr><td colspan="8" class="muted" style="text-align:center;padding:36px">Belum ada peserta</td></tr>';
  document.getElementById('autoInfo').textContent = '(diperbarui ' + new Date().toLocaleTimeString('id-ID') + ')';
}
function exportCsv() { window.location.href = '/api/teacher/export'; }
async function rilisPembahasan() {
  if (!await swalConfirm('Rilis pembahasan ke semua siswa yang sudah submit?')) return;
  var r = await fetch('/api/teacher/rilis-pembahasan', { method: 'POST' });
  var d = await r.json();
  if (d.ok) await swalSuccess('Pembahasan sudah dirilis. Siswa bisa melihatnya.');
  else await swalError(d.error || 'Gagal');
}
async function hapusPeserta(id, nama) {
  if (!await swalConfirm('Hapus peserta "' + nama + '"? Jawaban ikut terhapus.', 'Hapus Peserta')) return;
  await fetch('/api/teacher/hapus-peserta', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ siswaId: id })
  });
  await swalSuccess('Peserta dihapus');
  refreshLive();
}
function backupDb() { window.open('/api/teacher/backup', '_blank'); }
async function shutdownServer() {
  if (!await swalConfirm('Matikan server sekarang? Semua siswa yang sedang mengerjakan akan kehilangan koneksi.', 'Matikan Server')) return;
  if (!await swalConfirm('Yakin? Pastikan ujian sudah selesai dan data sudah dibackup.', 'Konfirmasi Terakhir')) return;
  await fetch('/api/teacher/shutdown', { method: 'POST' });
  Swal.fire({ icon: 'success', title: 'Server dimatikan', html: 'Tutup tab ini. Klik ikon <b>TKA Local Host</b> di desktop untuk memulai lagi.', allowOutsideClick: false, showConfirmButton: false });
}

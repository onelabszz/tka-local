async function loadGambar() {
  try {
    var r = await fetch('/api/teacher/gambar');
    if (!r.ok) return;
    var files = await r.json();
    document.getElementById('gambarCount').textContent = '(' + files.length + ' file)';
    if (!files.length) {
      document.getElementById('gambarList').innerHTML = '<p class="muted">Belum ada gambar.</p>';
      return;
    }
    document.getElementById('gambarList').innerHTML = files.map(function(f) {
      var kb = (f.ukuran / 1024).toFixed(0);
      return '<div class="gambar-item"><img src="' + f.url + '" alt=""><div class="gambar-nama">' + escapeHtml(f.nama) + '</div><div class="gambar-ukuran">' + kb + ' KB</div><button class="btn btn-danger btn-sm" onclick="hapusGambar(\'' + f.nama.replace(/'/g, "\\'") + '\')">Hapus</button></div>';
    }).join('');
  } catch (e) { console.error(e); }
}
async function uploadGambar() {
  var input = document.getElementById('gambarInput');
  var info = document.getElementById('uploadInfo');
  if (!input.files.length) { await swalInfo('Pilih file dulu'); return; }
  info.textContent = 'Mengupload ' + input.files.length + ' file…';
  var fd = new FormData();
  for (var i = 0; i < input.files.length; i++) fd.append('files', input.files[i]);
  try {
    var r = await fetch('/api/teacher/upload-gambar', { method: 'POST', body: fd });
    var d = await r.json();
    if (!r.ok) { info.textContent = ''; await swalError(d.error || 'Gagal upload'); return; }
    info.textContent = '';
    input.value = '';
    await swalSuccess(d.files.length + ' file berhasil diupload');
    loadGambar();
  } catch (e) { info.textContent = ''; await swalError(e.message); }
}
async function hapusGambar(nama) {
  if (!await swalConfirm('Hapus gambar "' + nama + '"?', 'Hapus Gambar')) return;
  try {
    var r = await fetch('/api/teacher/hapus-gambar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nama: nama })
    });
    var d = await r.json();
    if (!r.ok) { await swalError(d.error || 'Gagal hapus'); return; }
    await swalSuccess('Gambar dihapus');
    loadGambar();
  } catch (e) { await swalError(e.message); }
}

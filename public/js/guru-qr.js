async function refreshQR() {
  var errEl = document.getElementById('qrError');
  errEl.textContent = '';
  try {
    var r = await fetch('/api/teacher/qr');
    if (!r.ok) { errEl.textContent = 'QR tidak tersedia (HTTP ' + r.status + ')'; return; }
    var d = await r.json();
    document.getElementById('qrImage').src = d.dataUrl;
    document.getElementById('qrFullImage').src = d.dataUrl;
    document.getElementById('qrFullUrl').textContent = d.url;
    document.getElementById('siswaUrl').textContent = d.url;
  } catch (e) { errEl.textContent = 'Gagal memuat QR: ' + e.message; }
}
function bukaQRFullscreen() { document.getElementById('qrFullscreen').style.display = 'flex'; }
function tutupQRFullscreen() { document.getElementById('qrFullscreen').style.display = 'none'; }

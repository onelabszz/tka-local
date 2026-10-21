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

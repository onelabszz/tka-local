async function lihatReview(siswaId, nama) {
  swalLoading('Memuat review...');
  try {
    var r = await fetch('/api/teacher/review/' + siswaId);
    var data = await r.json();
    if (!r.ok) { Swal.close(); await swalError(data.error || 'Gagal'); return; }
    var html = '';
    data.items.forEach(function(it) {
      var badge;
      if (it.benar) badge = '<span style="background:#d1fae5;color:#047857;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:700">BENAR</span>';
      else if (it.sebagian) badge = '<span style="background:#fef3c7;color:#b45309;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:700">SEBAGIAN (' + it.skor + ')</span>';
      else badge = '<span style="background:#fee2e2;color:#b91c1c;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:700">SALAH</span>';
      var tipeBadge = it.tipe === 'mcma' ? '<span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:700">MCMA</span>'
                    : it.tipe === 'bs' ? '<span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:700">B/S</span>'
                    : '<span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:700">PG</span>';
      html += '<div style="border:1px solid #e2e8f0;border-radius:4px;padding:14px;margin-bottom:10px;text-align:left">';
      html += '<div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:8px;align-items:flex-start"><div style="font-weight:600;flex:1;font-size:13px">' + it.nomor + '. ' + tipeBadge + ' ' + escapeHtml(it.q) + '</div>' + badge + '</div>';
      if (it.img) html += '<img src="/gambar/' + encodeURIComponent(it.img) + '" style="display:block;max-width:100%;max-height:200px;margin:0 auto 10px;border-radius:4px" alt="">';
      if (it.tipe === 'pg') {
        var options = it.options || [];
        options.forEach(function(opt, idx) {
          var isK = (idx === it.correctIdx);
          var isJ = (idx === it.jawabanSiswa);
          var bg = isK ? 'background:#d1fae5;border:1px solid #86efac'
                 : isJ ? 'background:#fee2e2;border:1px solid #fca5a5'
                 : 'background:#f8fafc;border:1px solid #e2e8f0';
          html += '<div style="padding:8px 12px;border-radius:4px;margin:4px 0;font-size:12px;' + bg + '"><b>' + String.fromCharCode(65 + idx) + '.</b> ' + escapeHtml(opt || '') + (isK ? ' <b>[KUNCI]</b>' : '') + (isJ && !isK ? ' <b>[DIPILIH]</b>' : '') + '</div>';
        });
      } else if (it.tipe === 'mcma') {
        var arr = Array.isArray(it.jawabanSiswa) ? it.jawabanSiswa : [];
        var kunci = it.correctIndices || [];
        var options2 = it.options || [];
        options2.forEach(function(opt, idx) {
          var isK = kunci.indexOf(idx) >= 0;
          var isJ = arr.indexOf(idx) >= 0;
          var bg = 'background:#f8fafc;border:1px solid #e2e8f0';
          if (isK && isJ) bg = 'background:#d1fae5;border:1px solid #86efac';
          else if (isK) bg = 'background:#ecfdf5;border:1px solid #86efac';
          else if (isJ) bg = 'background:#fee2e2;border:1px solid #fca5a5';
          var mark = '';
          if (isK && isJ) mark = ' [kunci, dipilih]';
          else if (isK) mark = ' [kunci]';
          else if (isJ) mark = ' [salah dipilih]';
          html += '<div style="padding:8px 12px;border-radius:4px;margin:4px 0;font-size:12px;' + bg + '"><b>' + String.fromCharCode(65 + idx) + '.</b> ' + escapeHtml(opt || '') + mark + '</div>';
        });
      } else if (it.tipe === 'bs') {
        var arrB = Array.isArray(it.jawabanSiswa) ? it.jawabanSiswa : [];
        var pernyataan = it.pernyataan || [];
        html += '<table style="width:100%;border-collapse:collapse;margin-top:6px"><thead><tr style="background:#f1f5f9"><th style="padding:6px 8px;font-size:11px;text-align:left">Pernyataan</th><th style="padding:6px 8px;font-size:11px;width:50px;text-align:center">Kunci</th><th style="padding:6px 8px;font-size:11px;width:70px;text-align:center">Siswa</th></tr></thead><tbody>';
        pernyataan.forEach(function(p, i) {
          var jw = arrB[i];
          var teksJw = jw === true ? 'B' : jw === false ? 'S' : '—';
          var cocok = jw === p.key;
          html += '<tr><td style="padding:6px 8px;border-top:1px solid #e2e8f0;font-size:12px">' + escapeHtml(p.teks) + '</td><td style="padding:6px 8px;border-top:1px solid #e2e8f0;text-align:center;font-weight:700">' + (p.key ? 'B' : 'S') + '</td><td style="padding:6px 8px;border-top:1px solid #e2e8f0;text-align:center;font-weight:700;color:' + (cocok ? '#047857' : '#b91c1c') + '">' + teksJw + '</td></tr>';
        });
        html += '</tbody></table>';
      }
      if (it.pembahasan) html += '<div style="margin-top:10px;padding:10px;background:#f1f5f9;border-radius:4px;font-size:12px;border-left:3px solid #1e40af"><b>Pembahasan:</b> ' + escapeHtml(it.pembahasan) + '</div>';
      html += '</div>';
    });
    Swal.fire({
      title: escapeHtml(nama) + ' — ' + data.skor + '/' + data.total,
      html: html, width: '850px', showCloseButton: true, showConfirmButton: false,
      showCancelButton: true, cancelButtonText: 'Tutup', cancelButtonColor: '#64748b',
      didOpen: renderMathInSwal
    });
  } catch (e) {
    Swal.close();
    await swalError('Gagal memuat review: ' + e.message);
  }
}

async function loadAnalisis() {
  var r = await fetch('/api/teacher/analisis');
  if (!r.ok) { var err = await r.json().catch(function() { return {}; }); await swalError(err.error || 'Belum ada sesi'); return; }
  var d = await r.json();
  document.getElementById('analisisInfo').textContent = '(' + d.jumlahPeserta + ' peserta)';
  var s = d.stats;
  var statsHtml = '<div class="metrics" style="margin-bottom:16px">' +
    '<div class="metric"><div class="metric-label">Rata-rata</div><div class="metric-value">' + s.mean.toFixed(2) + '</div></div>' +
    '<div class="metric"><div class="metric-label">Median</div><div class="metric-value">' + s.median.toFixed(2) + '</div></div>' +
    '<div class="metric success"><div class="metric-label">Tertinggi</div><div class="metric-value">' + s.max + '</div></div>' +
    '<div class="metric danger"><div class="metric-label">Terendah</div><div class="metric-value">' + s.min + '</div></div>' +
    '<div class="metric"><div class="metric-label">Std. Dev</div><div class="metric-value">' + s.stddev.toFixed(2) + '</div></div>' +
    '</div>';
  if (!d.cukupUntukAnalisis) statsHtml += '<p class="muted">Minimal 8 peserta untuk daya beda bermakna.</p>';
  var rankingHtml = '<h4 style="margin:16px 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:.5px;color:var(--g700)">Ranking</h4><table style="margin-bottom:16px"><thead><tr><th>#</th><th>Nama</th><th>Kelas</th><th>Skor</th></tr></thead><tbody>' +
    d.ranking.map(function(x) { return '<tr><td>' + x.peringkat + '</td><td>' + escapeHtml(x.nama) + '</td><td>' + escapeHtml(x.kelas || '-') + '</td><td><b>' + x.skor + '</b></td></tr>'; }).join('') +
    '</tbody></table>';
  var itemRows = d.items.map(function(it) {
    var dist = '';
    if (it.distraktor) {
      dist = it.distraktor.filter(function(o) { return !o.adalahKunci && o.jumlah > 0; })
        .map(function(o) { return escapeHtml(o.teks) + ': ' + o.jumlah + '× (' + (o.persen * 100).toFixed(0) + '%)'; }).join('<br>') || '<span class="muted">—</span>';
    } else dist = '<span class="muted">—</span>';
    var flags = it.flags.length ? it.flags.map(function(f) { return '<span class="badge badge-warn">' + escapeHtml(f) + '</span>'; }).join(' ') : '<span class="muted">—</span>';
    var qShort = it.q.length > 40 ? it.q.substring(0, 40) + '…' : it.q;
    var tipeBadge = it.tipe === 'mcma' ? '<span class="badge badge-info">MCMA</span>'
                  : it.tipe === 'bs' ? '<span class="badge badge-info">B/S</span>'
                  : '<span class="badge badge-info">PG</span>';
    return '<tr><td>' + it.nomor + '</td><td>' + tipeBadge + '</td><td>' + escapeHtml(qShort) + '</td><td>' + (it.pValue * 100).toFixed(0) + '%</td><td>' + it.levelTingkat + '</td><td>' + (it.dIndex != null ? it.dIndex.toFixed(2) : '-') + '</td><td>' + it.levelDB + '</td><td style="font-size:12px">' + dist + '</td><td>' + flags + '</td></tr>';
  }).join('');
  var itemsHtml = '<h4 style="margin:16px 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:.5px;color:var(--g700)">Analisis Soal</h4><div style="overflow-x:auto"><table><thead><tr><th>#</th><th>Tipe</th><th>Soal</th><th>p</th><th>Tingkat</th><th>D</th><th>Daya Beda</th><th>Distraktor</th><th>Flag</th></tr></thead><tbody>' + itemRows + '</tbody></table></div>';
  document.getElementById('analisisContent').innerHTML = statsHtml + rankingHtml + itemsHtml;
}
function exportAnalisis() { window.open('/api/teacher/analisis/export', '_blank'); }

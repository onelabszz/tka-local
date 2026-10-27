// ============================================================
// siswa-app.js — v18.45 (Formal Exam UI)
// ============================================================

// ============ STATE ============
var LS_ID = 'tka_siswaId';
var LS_TOKEN = 'tka_token';
var LS_LATIHAN = 'tka_latihanId';
var examMode = 'ujian';
var latihanId = null;
var questions = [];
var answers = {};
var raguState = {};
var pendingQueue = {};
var pendingRagu = {};
var currentQ = 0;
var student = { siswaId: null };
var deadline = 0, serverOffset = 0, timerHandle = null, submitting = false;
var syncTimer = null, syncInterval = null;

// ============ PWA ============
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault();
  deferredPrompt = e;
  var wrap = document.getElementById('pwaInstallWrap');
  if (wrap) wrap.classList.remove('hidden');
});
document.addEventListener('DOMContentLoaded', function () {
  var btn = document.getElementById('pwaInstallBtn');
  if (btn) {
    btn.addEventListener('click', async function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      var r = await deferredPrompt.userChoice;
      if (r.outcome === 'accepted') {
        var wrap = document.getElementById('pwaInstallWrap');
        if (wrap) wrap.classList.add('hidden');
      }
      deferredPrompt = null;
    });
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(function () {});
  }
});

// ============ UTIL ============
function escapeHtml(s) {
  var d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}
function isAnswered(q) {
  var a = answers[q.id];
  if (a == null) return false;
  if (q.tipe === 'mcma') return Array.isArray(a) && a.length > 0;
  if (q.tipe === 'bs') return Array.isArray(a) && a.some(function (v) { return v != null; });
  return true;
}
function renderMath() {
  if (window.renderMathInElement) {
    try {
      renderMathInElement(document.body, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false },
          { left: '\\[', right: '\\]', display: true }
        ],
        throwOnError: false
      });
    } catch (e) {}
  }
}

// ============ ANTI-CHEAT ============
function laporkan(tipe) {
  if (examMode !== 'ujian' || !student.siswaId) return;
  fetch('/api/student/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ siswaId: student.siswaId, tipe: tipe })
  }).catch(function () {});
}
document.addEventListener('visibilitychange', function () {
  if (document.hidden) laporkan('tab_blur');
});
document.addEventListener('copy', function (e) { e.preventDefault(); laporkan('copy'); });
document.addEventListener('paste', function (e) { e.preventDefault(); laporkan('paste'); });
document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

// ============ LOGIN ============
async function loadPublicSekolah() {
  try {
    var r = await fetch('/api/public/sekolah');
    var d = await r.json();
    if (d.nama) {
      var el = document.getElementById('loginSchool');
      if (el) el.textContent = d.nama;
    }
  } catch (e) {}
}

async function join(ev) {
  if (ev) ev.preventDefault();
  var name = (document.getElementById('name').value || '').trim();
  var kelas = (document.getElementById('kelas').value || '').trim();
  var token = (document.getElementById('token').value || '').trim().toUpperCase();
  var btn = document.getElementById('joinBtn');
  var err = document.getElementById('err');

  if (!name || !token) { err.textContent = 'Nama dan token wajib diisi'; return; }

  btn.disabled = true;
  btn.textContent = 'Memuat…';
  err.textContent = '';

  try {
    var r = await fetch('/api/student/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token, nama: name, kelas: kelas })
    });
    var data = await r.json();
    if (!r.ok) {
      err.textContent = data.error || 'Gagal bergabung';
      btn.disabled = false;
      btn.textContent = 'Masuk Ujian';
      return;
    }

    localStorage.setItem(LS_ID, data.siswaId);
    localStorage.setItem(LS_TOKEN, token);
    localStorage.setItem('tka_nama', name);
    localStorage.setItem('tka_kelas', kelas);

    examMode = 'ujian';
    data.nama = name;
    data.kelas = kelas;
    resumeExam(data);
  } catch (e) {
    err.textContent = 'Gagal terhubung ke server';
    btn.disabled = false;
    btn.textContent = 'Masuk Ujian';
  }
}

// ============ LATIHAN ============
function bukaLatihanMode() {
  document.getElementById('loginView').classList.add('hidden');
  document.getElementById('latihanView').classList.remove('hidden');
  loadPaketLatihan();
}
function kembaliKeLogin() {
  document.getElementById('latihanView').classList.add('hidden');
  document.getElementById('loginView').classList.remove('hidden');
}
async function loadPaketLatihan() {
  var el = document.getElementById('latihanPaketList');
  el.innerHTML = '<p class="muted-center">Memuat paket…</p>';
  try {
    var r = await fetch('/api/student/paket-latihan');
    var list = await r.json();
    if (!list.length) {
      el.innerHTML = '<p class="muted-center">Belum ada paket latihan.<br>Hubungi guru untuk mengaktifkan.</p>';
      return;
    }
    el.innerHTML = list.map(function (p) {
      return '<div class="paket-item" onclick="mulaiLatihan(\'' + p.id + '\')">'
        + '<div class="paket-item-judul">' + escapeHtml(p.judul) + '</div>'
        + '<div class="paket-item-meta">' + escapeHtml(p.mapel) + ' · ' + p.jumlahSoal + ' soal · ' + p.durasiMenit + ' menit</div>'
        + '</div>';
    }).join('');
  } catch (e) {
    el.innerHTML = '<p class="muted-center">Gagal memuat paket.</p>';
  }
}
async function mulaiLatihan(paketId) {
  var nama = prompt('Nama lengkap peserta:');
  if (!nama || !nama.trim()) return;
  var kelas = prompt('Kelas (opsional):') || '';
  try {
    var r = await fetch('/api/student/practice/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paketId: paketId, nama: nama.trim(), kelas: kelas.trim() })
    });
    var data = await r.json();
    if (!r.ok) { alert(data.error || 'Gagal memulai latihan'); return; }
    examMode = 'latihan';
    latihanId = data.latihanId;
    localStorage.setItem(LS_LATIHAN, latihanId);
    localStorage.setItem('tka_nama', data.nama);
    localStorage.setItem('tka_kelas', data.kelas);
    resumeExam({
      latihanId: data.latihanId,
      nama: data.nama,
      kelas: data.kelas,
      deadline: data.deadline,
      serverNow: data.serverNow,
      durasiMenit: data.durasiMenit,
      totalSoal: data.totalSoal,
      questions: data.questions,
      ragu: {}
    });
  } catch (e) {
    alert('Gagal: ' + e.message);
  }
}

// ============ RESUME ============
function resumeExam(data) {
  questions = data.questions || [];
  answers = {};
  questions.forEach(function (q) { if (q.saved != null) answers[q.id] = q.saved; });
  raguState = data.ragu || {};
  pendingQueue = {};
  pendingRagu = {};
  currentQ = 0;
  student.siswaId = data.siswaId || null;
  deadline = data.deadline;
  serverOffset = data.serverNow - Date.now();

  document.getElementById('loginView').classList.add('hidden');
  document.getElementById('latihanView').classList.add('hidden');

  if (examMode === 'latihan') {
    // Latihan langsung masuk exam tanpa ready screen
    document.getElementById('examView').classList.remove('hidden');
    updateHeaderInfo(data);
    loadLocalDraft();
    renderQuestion();
    startTimer();
    return;
  }

  // Ujian: tampilkan ready screen
  document.getElementById('readyName').textContent = data.nama || localStorage.getItem('tka_nama') || '-';
  document.getElementById('readyTotal').textContent = questions.length + ' soal';
  document.getElementById('readyDurasi').textContent = data.durasiMenit + ' menit';
  document.getElementById('readyBrand').textContent = 'TKA';
  document.getElementById('readyView').classList.remove('hidden');
  document.body.dataset.examData = JSON.stringify(data);
}

function updateHeaderInfo(data) {
  document.getElementById('studentName').textContent = data.nama || localStorage.getItem('tka_nama') || '-';
  document.getElementById('studentClass').textContent = data.kelas || localStorage.getItem('tka_kelas') || '-';
  var qTotal = document.getElementById('qCounterTotal');
  if (qTotal) qTotal.textContent = questions.length;
}

// ============ READY -> FULLSCREEN -> START ============
async function masukLayarPenuh() {
  var el = document.documentElement;
  if (document.fullscreenElement) return;
  try {
    if (el.requestFullscreen) await el.requestFullscreen();
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    else if (el.msRequestFullscreen) await el.msRequestFullscreen();
    var w = document.getElementById('fullscreenWarning');
    if (w) w.classList.add('hidden');
  } catch (e) { console.warn('Fullscreen gagal:', e.message); }
}

async function mulaiUjianPenuh(ev) {
  var btn = ev && ev.target;
  if (btn) { btn.disabled = true; btn.textContent = 'Menyiapkan…'; }

  await masukLayarPenuh();

  document.getElementById('readyView').classList.add('hidden');
  document.getElementById('transitionView').classList.remove('hidden');

  await new Promise(function (r) { setTimeout(r, 2500); });

  var data = {};
  try { data = JSON.parse(document.body.dataset.examData || '{}'); } catch (e) {}
  updateHeaderInfo(data);

  document.getElementById('transitionView').classList.add('hidden');
  document.getElementById('examView').classList.remove('hidden');
  document.body.classList.add('exam-active');

  loadLocalDraft();
  renderQuestion();
  startTimer();
}

document.addEventListener('fullscreenchange', function () {
  if (!document.fullscreenElement) {
    if (examMode === 'ujian' && !submitting) {
      laporkan('tab_blur');
      var w = document.getElementById('fullscreenWarning');
      if (w) w.classList.remove('hidden');
    }
  } else {
    var w = document.getElementById('fullscreenWarning');
    if (w) w.classList.add('hidden');
  }
});

// ============ RENDER QUESTION ============
function renderQuestion() {
  var q = questions[currentQ];
  var saved = answers[q.id];
  var prevQ = currentQ > 0 ? questions[currentQ - 1] : null;
  var isDupWacana = q.wacana && prevQ && prevQ.wacana === q.wacana && prevQ.wacana_judul === q.wacana_judul;

  var html = '<div class="question-card">';
  html += '<div class="q-badge">Soal ' + (currentQ + 1) + ' · ' + tipeLabel(q.tipe) + '</div>';

  // Wacana
  if (q.wacana) {
    if (isDupWacana) {
      html += '<button type="button" class="wacana-btn" onclick="bukaWacanaModal()">Baca Teks Bacaan: '
        + escapeHtml(q.wacana_judul || 'Bacaan') + '</button>';
    } else {
      html += '<div class="wacana-box">';
      if (q.wacana_judul) html += '<div class="wacana-box-title">' + escapeHtml(q.wacana_judul) + '</div>';
      html += '<div class="wacana-box-text">' + escapeHtml(q.wacana) + '</div>';
      if (q.wacana_sumber) html += '<div class="wacana-box-source">Sumber: ' + escapeHtml(q.wacana_sumber) + '</div>';
      html += '</div>';
    }
  }

  html += '<h2 class="q-text">' + escapeHtml(q.q) + '</h2>';

  if (q.img) {
    html += '<img class="q-image" src="/gambar/' + encodeURIComponent(q.img) + '" onclick="bukaLightbox(this.src)" alt="Gambar soal">';
    if (q.img_caption) html += '<div class="q-img-caption">' + escapeHtml(q.img_caption) + '</div>';
  }

  if (q.tipe === 'pg') html += renderPg(q, saved);
  else if (q.tipe === 'mcma') html += renderMcma(q, saved);
  else if (q.tipe === 'bs') html += renderBs(q, saved);

  html += '</div>';
  document.getElementById('questionContainer').innerHTML = html;
  renderMath();

  document.getElementById('qCounterCurrent').textContent = currentQ + 1;
  document.getElementById('prevBtn').disabled = currentQ === 0;
  document.getElementById('nextBtn').disabled = currentQ === questions.length - 1;
  updateRaguButton();
  updateProgress();
  renderNavigator();
}

function tipeLabel(tipe) {
  if (tipe === 'mcma') return 'PILIHAN GANDA KOMPLEKS';
  if (tipe === 'bs') return 'BENAR / SALAH';
  return 'PILIHAN GANDA';
}

function renderPg(q, saved) {
  var html = '<div class="q-options">';
  for (var idx = 0; idx < q.options.length; idx++) {
    var letter = String.fromCharCode(65 + idx);
    var isSel = (saved === idx);
    var cls = 'soal-opsi' + (isSel ? ' pg-terpilih' : '');
    var optImg = (q.optionImgs && q.optionImgs[idx])
      ? '<img class="option-img" src="/gambar/' + encodeURIComponent(q.optionImgs[idx]) + '" onclick="event.preventDefault();event.stopPropagation();bukaLightbox(this.src)" alt="">'
      : '';
    html += '<label class="' + cls + '">'
      + '<input type="radio" name="pg_' + q.id + '" value="' + idx + '" class="sembunyi" '
      + (isSel ? 'checked' : '') + ' onchange="selectPg(' + idx + ')">'
      + '<span class="huruf-pg">' + letter + '.</span>'
      + '<span class="option-text">' + escapeHtml(q.options[idx] || '') + optImg + '</span>'
      + '</label>';
  }
  return html + '</div>';
}

function renderMcma(q, saved) {
  var arr = Array.isArray(saved) ? saved : [];
  var html = '<p class="q-hint">Pilih semua jawaban yang benar (bisa lebih dari satu)</p><div class="q-options">';
  for (var idx = 0; idx < q.options.length; idx++) {
    var checked = arr.indexOf(idx) >= 0;
    var cls = 'soal-opsi' + (checked ? ' mcma-terpilih' : '');
    var optImg = (q.optionImgs && q.optionImgs[idx])
      ? '<img class="option-img" src="/gambar/' + encodeURIComponent(q.optionImgs[idx]) + '" onclick="event.preventDefault();event.stopPropagation();bukaLightbox(this.src)" alt="">'
      : '';
    html += '<label class="' + cls + '">'
      + '<input type="checkbox" name="mcma_' + q.id + '" value="' + idx + '" class="sembunyi" '
      + (checked ? 'checked' : '') + ' onchange="toggleMcma(' + idx + ')">'
      + '<span class="kotak-centang"></span>'
      + '<span class="option-text">' + escapeHtml(q.options[idx] || '') + optImg + '</span>'
      + '</label>';
  }
  return html + '</div>';
}

function renderBs(q, saved) {
  var arr = Array.isArray(saved) ? saved : [];
  var html = '<p class="q-hint">Tentukan Benar atau Salah untuk setiap pernyataan</p>';
  html += '<table class="tabel-bs"><thead><tr><th>Pernyataan</th><th class="pusat">Benar</th><th class="pusat">Salah</th></tr></thead><tbody>';
  for (var i = 0; i < q.pernyataan.length; i++) {
    var val = arr[i];
    html += '<tr><td>' + escapeHtml(q.pernyataan[i]) + '</td>';
    html += '<td class="pusat"><label><input type="radio" name="bs_' + i + '" value="true" class="sembunyi" '
      + (val === true ? 'checked' : '') + ' onchange="setBs(' + i + ',true)"><span class="radio-bs"></span></label></td>';
    html += '<td class="pusat"><label><input type="radio" name="bs_' + i + '" value="false" class="sembunyi" '
      + (val === false ? 'checked' : '') + ' onchange="setBs(' + i + ',false)"><span class="radio-bs"></span></label></td>';
    html += '</tr>';
  }
  return html + '</tbody></table>';
}

function updateRaguButton() {
  var q = questions[currentQ];
  var btn = document.getElementById('raguBtn');
  if (!btn) return;
  var isRagu = !!raguState[q.id];
  btn.classList.toggle('active', isRagu);
  var label = btn.querySelector('span');
  if (label) label.textContent = isRagu ? 'Ditandai Ragu' : 'Tandai Ragu';
}

function updateProgress() {
  var total = questions.length;
  var dijawab = questions.filter(isAnswered).length;
  var ragu = Object.keys(raguState).length;
  var kosong = total - dijawab;
  var pct = total ? (dijawab / total) * 100 : 0;

  var pf = document.getElementById('progressFill');
  if (pf) pf.style.width = pct + '%';

  var sd = document.getElementById('statDijawab');
  var sr = document.getElementById('statRagu');
  var sk = document.getElementById('statKosong');
  if (sd) sd.textContent = dijawab;
  if (sr) sr.textContent = ragu;
  if (sk) sk.textContent = kosong;
}

function renderNavigator() {
  var html = '';
  for (var i = 0; i < questions.length; i++) {
    var q = questions[i];
    var cls = 'nav-item';
    if (raguState[q.id]) cls += ' ragu';
    else if (isAnswered(q)) cls += ' answered';
    if (i === currentQ) cls += ' current';
    html += '<button class="' + cls + '" onclick="goTo(' + i + ')">' + (i + 1) + '</button>';
  }
  var grid = document.getElementById('navGrid');
  if (grid) grid.innerHTML = html;
}

// ============ INTERAKSI ============
function selectPg(idx) {
  var q = questions[currentQ];
  answers[q.id] = idx;
  queueAnswer(q.id, idx);
  renderQuestion();
}
function toggleMcma(idx) {
  var q = questions[currentQ];
  var arr = Array.isArray(answers[q.id]) ? answers[q.id].slice() : [];
  var pos = arr.indexOf(idx);
  if (pos >= 0) arr.splice(pos, 1); else arr.push(idx);
  arr.sort(function (a, b) { return a - b; });
  answers[q.id] = arr;
  queueAnswer(q.id, arr);
  renderQuestion();
}
function setBs(i, val) {
  var q = questions[currentQ];
  var arr = Array.isArray(answers[q.id]) ? answers[q.id].slice() : new Array(q.pernyataan.length).fill(null);
  arr[i] = val;
  answers[q.id] = arr;
  queueAnswer(q.id, arr);
  renderQuestion();
}

async function toggleRagu() {
  var q = questions[currentQ];
  var nextVal = !raguState[q.id];
  if (nextVal) raguState[q.id] = true;
  else delete raguState[q.id];

  updateRaguButton();
  renderNavigator();
  updateProgress();

  if (examMode === 'latihan') { saveLocalDraft(); return; }
  if (!navigator.onLine) {
    pendingRagu[q.id] = nextVal;
    saveLocalDraft();
    return;
  }
  try {
    await fetch('/api/student/flag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siswaId: student.siswaId, soalId: q.id, ragu: nextVal })
    });
  } catch (e) {
    pendingRagu[q.id] = nextVal;
    saveLocalDraft();
  }
}

function prevQuestion() { if (currentQ > 0) { currentQ--; renderQuestion(); } }
function nextQuestion() { if (currentQ < questions.length - 1) { currentQ++; renderQuestion(); } }
function goTo(i) {
  currentQ = i;
  renderQuestion();
  var sb = document.getElementById('examSidebar');
  if (sb && sb.classList.contains('open')) toggleSidebar();
}
function toggleSidebar() {
  var sb = document.getElementById('examSidebar');
  var ov = document.getElementById('navOverlay');
  if (!sb) return;
  var open = sb.classList.toggle('open');
  if (ov) ov.classList.toggle('hidden', !open);
}

// ============ AUTOSAVE + SYNC ============
function queueAnswer(soalId, jawaban) {
  answers[soalId] = jawaban;
  pendingQueue[soalId] = jawaban;
  saveLocalDraft();
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncPending, 400);
}
async function syncPending() {
  if (!navigator.onLine) return;
  var ids = Object.keys(pendingQueue);
  for (var i = 0; i < ids.length; i++) {
    var soalId = ids[i];
    try {
      var url, body;
      if (examMode === 'latihan') {
        url = '/api/student/practice/answer';
        body = { latihanId: latihanId, soalId: soalId, jawaban: pendingQueue[soalId] };
      } else {
        url = '/api/student/answer';
        body = { siswaId: student.siswaId, soalId: soalId, jawaban: pendingQueue[soalId] };
      }
      var r = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (r.ok) delete pendingQueue[soalId];
      else if (r.status === 409 || r.status === 410) return;
    } catch (e) { return; }
  }
  var rids = Object.keys(pendingRagu);
  for (var j = 0; j < rids.length; j++) {
    try {
      await fetch('/api/student/flag', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siswaId: student.siswaId, soalId: rids[j], ragu: pendingRagu[rids[j]] })
      });
      delete pendingRagu[rids[j]];
    } catch (e) { return; }
  }
  if (Object.keys(pendingQueue).length === 0) clearLocalDraft();
}
function draftKey() {
  return examMode === 'latihan' ? 'tka_draft_latihan_' + latihanId : 'tka_draft_ujian_' + student.siswaId;
}
function saveLocalDraft() {
  try {
    localStorage.setItem(draftKey(), JSON.stringify({ queue: pendingQueue, ragu: pendingRagu, ts: Date.now() }));
  } catch (e) {}
}
function loadLocalDraft() {
  try {
    var raw = localStorage.getItem(draftKey());
    if (!raw) return;
    var d = JSON.parse(raw);
    if (!d.ts || Date.now() - d.ts > 24 * 3600 * 1000) { localStorage.removeItem(draftKey()); return; }
    if (d.queue) Object.assign(pendingQueue, d.queue);
    if (d.ragu) Object.assign(pendingRagu, d.ragu);
    if (Object.keys(pendingQueue).length > 0) {
      Object.assign(answers, pendingQueue);
      setTimeout(syncPending, 1000);
    }
  } catch (e) {}
}
function clearLocalDraft() {
  try { localStorage.removeItem(draftKey()); } catch (e) {}
}
window.addEventListener('online', syncPending);
syncInterval = setInterval(function () {
  if (Object.keys(pendingQueue).length > 0 || Object.keys(pendingRagu).length > 0) syncPending();
}, 10000);

// ============ TIMER ============
function startTimer() {
  function tick() {
    var remain = deadline - (Date.now() + serverOffset);
    var el = document.getElementById('timer');
    var txt = document.getElementById('timerText');
    if (!el || !txt) return;
    if (remain <= 0) {
      clearInterval(timerHandle);
      txt.textContent = 'HABIS';
      el.className = 'exam-timer danger';
      var pb = document.getElementById('prevBtn');
      var nb = document.getElementById('nextBtn');
      if (pb) pb.disabled = true;
      if (nb) nb.disabled = true;
      doSubmit(true);
      return;
    }
    var m = Math.floor(remain / 60000);
    var s = Math.floor((remain % 60000) / 1000);
    txt.textContent = (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
    el.className = 'exam-timer' + (remain < 60000 ? ' danger' : remain < 300000 ? ' warn' : '');
  }
  tick();
  timerHandle = setInterval(tick, 1000);
}

// ============ SUBMIT ============
async function submitExam() {
  var unanswered = questions.filter(function (q) { return !isAnswered(q); }).length;
  var raguCount = Object.keys(raguState).length;

  var msg = 'Anda akan mengakhiri ujian.';
  if (unanswered > 0) msg += '\n\nMasih ada ' + unanswered + ' soal belum dijawab.';
  if (raguCount > 0) msg += '\n\nAda ' + raguCount + ' soal ditandai ragu-ragu.';
  msg += '\n\nJawaban tidak dapat diubah setelah dikirim. Lanjutkan?';

  if (!confirm(msg)) return;
  doSubmit(false);
}

async function doSubmit(auto) {
  if (submitting) return;
  submitting = true;
  clearInterval(timerHandle);
  if (Object.keys(pendingQueue).length > 0) {
    try { await syncPending(); } catch (e) {}
  }
  try {
    var url, body;
    if (examMode === 'latihan') {
      url = '/api/student/practice/submit';
      body = { latihanId: latihanId };
    } else {
      url = '/api/student/submit';
      body = { siswaId: student.siswaId };
    }
    var r = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    var data = await r.json();

    if (examMode === 'ujian') localStorage.setItem('tka_last_siswaId', student.siswaId);
    else localStorage.setItem('tka_last_latihanId', latihanId);
    localStorage.removeItem(LS_ID);
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_LATIHAN);
    clearLocalDraft();
    if (syncInterval) clearInterval(syncInterval);
    document.body.classList.remove('exam-active');

    // exit fullscreen
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch (e) {}

    document.getElementById('examView').classList.add('hidden');
    document.getElementById('doneView').classList.remove('hidden');
    document.getElementById('doneTitle').textContent = examMode === 'latihan' ? 'Latihan Selesai' : 'Ujian Selesai';
    document.getElementById('result').textContent = data.skor + ' / ' + data.total;
    document.getElementById('late').textContent = auto
      ? 'Waktu habis — jawaban dikirim otomatis.'
      : (data.late ? 'Catatan: dikirim setelah waktu habis.' : '');
  } catch (e) {
    submitting = false;
    alert('Gagal mengirim. Periksa koneksi dan coba lagi.');
  }
}

// ============ REVIEW ============
async function bukaPembahasan() {
  var info = document.getElementById('reviewInfo');
  info.textContent = 'Memuat…';
  try {
    var url, body;
    if (examMode === 'latihan') {
      var lid = localStorage.getItem('tka_last_latihanId') || latihanId;
      if (!lid) { info.textContent = 'Sesi latihan sudah ditutup.'; return; }
      url = '/api/student/practice/review';
      body = { latihanId: lid };
    } else {
      var sid = localStorage.getItem('tka_last_siswaId');
      if (!sid) { info.textContent = 'Sesi ujian sudah ditutup.'; return; }
      url = '/api/student/review';
      body = { siswaId: sid };
    }
    var r = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    var data = await r.json();
    if (!r.ok) { info.textContent = data.error || 'Gagal'; return; }

    document.getElementById('reviewWho').textContent =
      data.siswa.nama + ' · ' + (data.siswa.kelas || '-') + '  |  Skor ' + data.skor + ' / ' + data.total;

    var list = document.getElementById('reviewList');
    if (!data.pembahasanDirilis) {
      list.innerHTML = '<div class="review-item"><p>Pembahasan belum dirilis oleh pengawas.</p></div>';
    } else {
      list.innerHTML = data.items.map(renderReviewItem).join('');
      renderMath();
    }

    document.getElementById('doneView').classList.add('hidden');
    document.getElementById('reviewView').classList.remove('hidden');
    info.textContent = '';
  } catch (e) {
    info.textContent = 'Gagal memuat: ' + e.message;
  }
}

function renderReviewItem(it) {
  var badge = it.benar
    ? '<span class="review-badge benar">BENAR</span>'
    : (it.sebagian
      ? '<span class="review-badge sebagian">SEBAGIAN (' + it.skor + ')</span>'
      : '<span class="review-badge salah">SALAH</span>');

  var html = '<div class="review-item">';

  if (it.wacana) {
    html += '<div class="wacana-box" style="margin-bottom:12px">';
    if (it.wacana_judul) html += '<div class="wacana-box-title">' + escapeHtml(it.wacana_judul) + '</div>';
    html += '<div class="wacana-box-text">' + escapeHtml(it.wacana) + '</div>';
    if (it.wacana_sumber) html += '<div class="wacana-box-source">Sumber: ' + escapeHtml(it.wacana_sumber) + '</div>';
    html += '</div>';
  }

  html += '<div class="review-q"><div class="review-q-text">' + it.nomor + '. ' + escapeHtml(it.q) + '</div>' + badge + '</div>';

  if (it.img) {
    html += '<img class="q-image" src="/gambar/' + encodeURIComponent(it.img) + '" onclick="bukaLightbox(this.src)" alt="">';
    if (it.img_caption) html += '<div class="q-img-caption">' + escapeHtml(it.img_caption) + '</div>';
  }

  if (it.tipe === 'pg') {
    it.options.forEach(function (opt, idx) {
      var isK = (idx === it.correctIdx);
      var isJ = (idx === it.jawabanSiswa);
      var cls = 'review-opt';
      if (isK) cls += ' kunci';
      if (isJ) cls += ' pilihan';
      var oi = (it.optionImgs && it.optionImgs[idx])
        ? '<img class="option-img" src="/gambar/' + encodeURIComponent(it.optionImgs[idx]) + '" alt="">'
        : '';
      html += '<div class="' + cls + '">' + String.fromCharCode(65 + idx) + '. '
        + escapeHtml(opt || '')
        + (isK ? ' (kunci)' : '') + (isJ && !isK ? ' (jawabanmu)' : '') + oi + '</div>';
    });
  } else if (it.tipe === 'mcma') {
    var arr = Array.isArray(it.jawabanSiswa) ? it.jawabanSiswa : [];
    var kunci = it.correctIndices || [];
    it.options.forEach(function (opt, idx) {
      var isK = kunci.indexOf(idx) >= 0;
      var isJ = arr.indexOf(idx) >= 0;
      var cls = 'review-opt';
      if (isK) cls += ' kunci';
      if (isJ && !isK) cls += ' pilihan';
      var mark = '';
      if (isK && isJ) mark = ' (kunci, dipilih)';
      else if (isK) mark = ' (kunci)';
      else if (isJ) mark = ' (salah pilih)';
      html += '<div class="' + cls + '">' + String.fromCharCode(65 + idx) + '. '
        + escapeHtml(opt || '') + mark + '</div>';
    });
  } else if (it.tipe === 'bs') {
    var arrB = Array.isArray(it.jawabanSiswa) ? it.jawabanSiswa : [];
    html += '<table class="tabel-bs"><thead><tr><th>Pernyataan</th><th class="pusat">Kunci</th><th class="pusat">Jawaban</th></tr></thead><tbody>';
    it.pernyataan.forEach(function (p, i) {
      var jw = arrB[i];
      var teksJw = jw === true ? 'B' : jw === false ? 'S' : '—';
      var cocok = jw === p.key;
      html += '<tr><td>' + escapeHtml(p.teks) + '</td>';
      html += '<td class="pusat" style="font-weight:700">' + (p.key ? 'B' : 'S') + '</td>';
      html += '<td class="pusat" style="font-weight:700;color:' + (cocok ? 'var(--success)' : 'var(--danger)') + '">' + teksJw + '</td></tr>';
    });
    html += '</tbody></table>';
  }

  if (it.pembahasan) {
    html += '<div class="review-pemb"><b>Pembahasan:</b> ' + escapeHtml(it.pembahasan) + '</div>';
  }

  return html + '</div>';
}

// ============ WACANA MODAL ============
function bukaWacanaModal() {
  var q = questions[currentQ];
  if (!q || !q.wacana) return;
  document.getElementById('wacanaModalTitle').textContent = q.wacana_judul || 'Teks Bacaan';
  document.getElementById('wacanaModalBody').textContent = q.wacana;
  document.getElementById('wacanaModalSource').textContent = q.wacana_sumber ? 'Sumber: ' + q.wacana_sumber : '';
  document.getElementById('wacanaModal').classList.remove('hidden');
}
function tutupWacanaModal() {
  document.getElementById('wacanaModal').classList.add('hidden');
}

// ============ LIGHTBOX ============
function bukaLightbox(src) {
  var img = document.getElementById('lightboxImg');
  var lb = document.getElementById('imageLightbox');
  if (img && lb) { img.src = src; lb.classList.add('show'); }
}
function tutupLightbox(e) {
  if (!e || e.target.tagName !== 'IMG' || e.target.classList.contains('lightbox-close')) {
    var lb = document.getElementById('imageLightbox');
    if (lb) lb.classList.remove('show');
  }
}

// ============ AUTO RESUME ============
async function autoResume() {
  var siswaId = localStorage.getItem(LS_ID);
  if (!siswaId) return;
  var resEl = document.getElementById('resuming');
  if (resEl) resEl.classList.remove('hidden');
  try {
    var r = await fetch('/api/student/state', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siswaId: siswaId })
    });
    if (!r.ok) { localStorage.removeItem(LS_ID); localStorage.removeItem(LS_TOKEN); return; }
    var data = await r.json();
    if (data.sudahSubmit) { localStorage.removeItem(LS_ID); localStorage.removeItem(LS_TOKEN); return; }
    examMode = 'ujian';
    resumeExam(data);
  } catch (e) {
    localStorage.removeItem(LS_ID);
    localStorage.removeItem(LS_TOKEN);
  } finally {
    if (resEl) resEl.classList.add('hidden');
  }
}

// ============ KEYBOARD ============
document.addEventListener('keydown', function (e) {
  var ev = document.getElementById('examView');
  if (!ev || ev.classList.contains('hidden')) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'ArrowRight') { e.preventDefault(); nextQuestion(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); prevQuestion(); }
  else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); toggleRagu(); }
  else if (e.key === 'Escape') {
    tutupWacanaModal();
    tutupLightbox();
  }
});

window.addEventListener('beforeunload', function (e) {
  var ev = document.getElementById('examView');
  if (ev && !ev.classList.contains('hidden') && !submitting) {
    if (Object.keys(pendingQueue).length > 0) saveLocalDraft();
    e.preventDefault();
    e.returnValue = '';
  }
});

// ============ INIT ============
document.addEventListener('DOMContentLoaded', function () {
  loadPublicSekolah();
  autoResume();
});

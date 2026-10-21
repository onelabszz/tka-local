// ============================================================
// siswa-app.js — v18.6 (PWA + Rumus + Zoom Gambar)
// ============================================================

// ===== PWA INSTALL LOGIC =====
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const wrap = document.getElementById('pwaInstallWrap');
  if (wrap) wrap.style.display = 'block';
});

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('pwaInstallBtn');
  if (btn) {
    btn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        const wrap = document.getElementById('pwaInstallWrap');
        if (wrap) wrap.style.display = 'none';
      }
      deferredPrompt = null;
    });
  }

  // Daftarkan Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.log('SW Gagal:', err));
  }
});
// =============================

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
var syncTimer = null;
var syncInterval = null;

// ============ MATH RENDER (KaTeX) ============
function renderMath() {
  if (window.renderMathInElement) {
    renderMathInElement(document.body, {
      delimiters: [
        {left: '$$', right: '$$', display: true},
        {left: '$', right: '$', display: false}
      ],
      throwOnError: false
    });
  }
}

// ============ LIGHTBOX (Zoom Gambar) ============
function bukaLightbox(src) {
  var img = document.getElementById('lightboxImg');
  var lb = document.getElementById('imageLightbox');
  if (img && lb) {
    img.src = src;
    lb.classList.add('show');
  }
}
function tutupLightbox(e) {
  var lb = document.getElementById('imageLightbox');
  if (!e || e.target.tagName !== 'IMG' || e.target.classList.contains('lightbox-close')) {
    if (lb) lb.classList.remove('show');
  }
}

// ============ FULLSCREEN LOCK (KIOSK) ============
function masukLayarPenuh() {
  var el = document.documentElement;
  if (el.requestFullscreen) {
    el.requestFullscreen().catch(function(e){ console.warn('Fullscreen gagal:', e); });
  } else if (el.webkitRequestFullscreen) {
    el.webkitRequestFullscreen();
  } else if (el.msRequestFullscreen) {
    el.msRequestFullscreen();
  }
  var warning = document.getElementById('fullscreenWarning');
  if (warning) warning.classList.add('hidden');
}

document.addEventListener('fullscreenchange', function() {
  if (!document.fullscreenElement && !document.webkitIsFullScreen) {
    if (examMode === 'ujian' && !submitting) {
      laporkan('tab_blur'); // Catat sebagai pelanggaran
      var warning = document.getElementById('fullscreenWarning');
      if (warning) warning.classList.remove('hidden');
    }
  } else {
    var warning = document.getElementById('fullscreenWarning');
    if (warning) warning.classList.add('hidden');
  }
});

// ============ ANTI-CHEAT ============
function laporkan(tipe) {
  if (examMode !== 'ujian' || !student.siswaId) return;
  fetch('/api/student/event', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ siswaId: student.siswaId, tipe: tipe })
  }).catch(function () {});
}
document.addEventListener('visibilitychange', function () { if (document.hidden) laporkan('tab_blur'); });
document.addEventListener('copy', function (e) { e.preventDefault(); laporkan('copy'); });
document.addEventListener('paste', function (e) { e.preventDefault(); laporkan('paste'); });
document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

// ============ INIT / AUTO RESUME ============
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
    localStorage.removeItem(LS_ID); localStorage.removeItem(LS_TOKEN);
  } finally {
    if (resEl) resEl.classList.add('hidden');
  }
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoResume);
} else {
  autoResume();
}

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

// ============ LOGIN UJIAN ============
async function join(ev) {
  if (ev) ev.preventDefault();
  var name = document.getElementById('name').value.trim();
  var kelas = document.getElementById('kelas').value.trim();
  var token = document.getElementById('token').value.trim().toUpperCase();
  var btn = document.getElementById('joinBtn');
  var errEl = document.getElementById('err');
  if (!name || !token) { errEl.textContent = 'Nama dan token wajib diisi'; return; }
  btn.disabled = true; btn.textContent = 'Memuat…';
  errEl.textContent = '';
  try {
    var r = await fetch('/api/student/join', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token, nama: name, kelas: kelas })
    });
    var data = await r.json();
    if (!r.ok) {
      errEl.textContent = data.error || 'Gagal bergabung';
      btn.disabled = false; btn.textContent = 'Mulai Ujian';
      return;
    }
    localStorage.setItem(LS_ID, data.siswaId);
    localStorage.setItem(LS_TOKEN, token);
    localStorage.setItem('tka_nama', name);
    localStorage.setItem('tka_kelas', kelas);
    examMode = 'ujian';
    masukLayarPenuh();
    document.getElementById('examBadge').textContent = 'TKA';
    data.nama = name; data.kelas = kelas;
    resumeExam(data);
  } catch (e) {
    errEl.textContent = 'Gagal terhubung ke server';
    btn.disabled = false; btn.textContent = 'Mulai Ujian';
  }
}

// ============ LATIHAN MANDIRI ============
async function bukaLatihanMode() {
  document.getElementById('loginView').classList.add('hidden');
  document.getElementById('latihanView').classList.remove('hidden');
  await loadPaketLatihan();
}
function kembaliKeLogin() {
  document.getElementById('latihanView').classList.add('hidden');
  document.getElementById('loginView').classList.remove('hidden');
}
async function loadPaketLatihan() {
  var el = document.getElementById('latihanPaketList');
  el.innerHTML = '<p style="text-align:center;color:var(--g500)">Memuat paket…</p>';
  try {
    var r = await fetch('/api/student/paket-latihan');
    var list = await r.json();
    if (!list.length) {
      el.innerHTML = '<p style="text-align:center;color:var(--g500)">Belum ada paket latihan.<br>Hubungi guru untuk mengaktifkan.</p>';
      return;
    }
    el.innerHTML = list.map(function (p) {
      return '<div class="paket-item" onclick="mulaiLatihan(\'' + p.id + '\')">' +
        '<div class="paket-item-judul">' + escapeHtml(p.judul) + '</div>' +
        '<div class="paket-item-meta">' + escapeHtml(p.mapel) + ' · ' + p.jumlahSoal + ' soal · ' + p.durasiMenit + ' menit</div>' +
        '</div>';
    }).join('');
  } catch (e) {
    el.innerHTML = '<p style="text-align:center;color:var(--danger)">Gagal memuat: ' + e.message + '</p>';
  }
}
async function mulaiLatihan(paketId) {
  var nama = prompt('Nama lengkap Anda:');
  if (!nama || !nama.trim()) return;
  var kelas = prompt('Kelas (opsional):') || '';
  try {
    var r = await fetch('/api/student/practice/join', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paketId: paketId, nama: nama.trim(), kelas: kelas.trim() })
    });
    var data = await r.json();
    if (!r.ok) { alert(data.error || 'Gagal memulai latihan'); return; }
    examMode = 'latihan';
    latihanId = data.latihanId;
    localStorage.setItem(LS_LATIHAN, latihanId);
    localStorage.setItem('tka_nama', data.nama);
    localStorage.setItem('tka_kelas', data.kelas);
    document.getElementById('examBadge').textContent = 'LATIHAN';
    resumeExam({
      latihanId: data.latihanId, nama: data.nama, kelas: data.kelas,
      deadline: data.deadline, serverNow: data.serverNow,
      durasiMenit: data.durasiMenit, totalSoal: data.totalSoal,
      questions: data.questions, ragu: {}
    });
  } catch (e) { alert('Gagal: ' + e.message); }
}

// ============ RESUME / START ============
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
  document.getElementById('studentName').textContent = data.nama || localStorage.getItem('tka_nama') || '-';
  document.getElementById('studentClass').textContent = data.kelas || localStorage.getItem('tka_kelas') || '-';
  document.getElementById('loginView').classList.add('hidden');
  document.getElementById('latihanView').classList.add('hidden');
  document.getElementById('examView').classList.remove('hidden');
  document.body.classList.add('exam-active');
  if (examMode === 'ujian') masukLayarPenuh();
  loadLocalDraft();
  renderQuestion();
  startTimer();
}

// ============ SIDEBAR ============
function toggleSidebar() {
  var sidebar = document.getElementById('examSidebar');
  var overlay = document.getElementById('navOverlay');
  var open = sidebar.classList.toggle('open');
  overlay.classList.toggle('hidden', !open);
}

// ============ RENDER ============
function renderQuestion() {
  var q = questions[currentQ];
  var saved = answers[q.id];
  var html = '<div class="question-card">';
  html += '<div class="q-badge">Soal ' + (currentQ + 1) + ' dari ' + questions.length + '</div>';
  html += '<h2 class="q-text">' + escapeHtml(q.q) + '</h2>';
  if (q.img) html += '<img class="q-image" src="/gambar/' + encodeURIComponent(q.img) + '" onclick="bukaLightbox(this.src)" alt="">';
  
  if (q.tipe === 'pg') html += renderPg(q, saved);
  else if (q.tipe === 'mcma') html += renderMcma(q, saved);
  else if (q.tipe === 'bs') html += renderBs(q, saved);
  
  html += '</div>';
  document.getElementById('questionContainer').innerHTML = html;
  renderMath();
  
  document.getElementById('prevBtn').disabled = currentQ === 0;
  document.getElementById('nextBtn').disabled = currentQ === questions.length - 1;
  updateRaguButton();
  updateProgress();
  renderNavigator();
}

function renderPg(q, saved) {
  var html = '<div class="q-options">';
  for (var idx = 0; idx < q.options.length; idx++) {
    var letter = String.fromCharCode(65 + idx);
    var cls = 'option' + (saved === idx ? ' selected' : '');
    var optImg = (q.optionImgs && q.optionImgs[idx]) ? '<img class="option-img" src="/gambar/' + encodeURIComponent(q.optionImgs[idx]) + '" onclick="event.stopPropagation(); bukaLightbox(this.src)" alt="">' : '';
    html += '<button type="button" class="' + cls + '" onclick="selectPg(' + idx + ')"><span class="option-letter">' + letter + '</span><span class="option-text">' + escapeHtml(q.options[idx] || '') + optImg + '</span><span class="option-check">✓</span></button>';
  }
  return html + '</div>';
}

function renderMcma(q, saved) {
  var arr = Array.isArray(saved) ? saved : [];
  var html = '<p class="q-hint">Pilih semua jawaban yang benar</p><div class="q-options">';
  for (var idx = 0; idx < q.options.length; idx++) {
    var letter = String.fromCharCode(65 + idx);
    var checked = arr.indexOf(idx) >= 0;
    var cls = 'option' + (checked ? ' selected' : '');
    var optImg = (q.optionImgs && q.optionImgs[idx]) ? '<img class="option-img" src="/gambar/' + encodeURIComponent(q.optionImgs[idx]) + '" onclick="event.stopPropagation(); bukaLightbox(this.src)" alt="">' : '';
    html += '<button type="button" class="' + cls + '" onclick="toggleMcma(' + idx + ')"><span class="option-letter">' + (checked ? '✓' : letter) + '</span><span class="option-text">' + escapeHtml(q.options[idx] || '') + optImg + '</span></button>';
  }
  return html + '</div>';
}

function renderBs(q, saved) {
  var arr = Array.isArray(saved) ? saved : [];
  var html = '<p class="q-hint">Tentukan Benar atau Salah untuk setiap pernyataan</p>';
  html += '<table class="bs-table"><thead><tr><th>Pernyataan</th><th>B</th><th>S</th></tr></thead><tbody>';
  for (var i = 0; i < q.pernyataan.length; i++) {
    var val = arr[i];
    html += '<tr><td>' + escapeHtml(q.pernyataan[i]) + '</td>';
    html += '<td><label class="bs-cell"><input type="radio" name="bs' + i + '" ' + (val === true ? 'checked' : '') + ' onchange="setBs(' + i + ', true)">B</label></td>';
    html += '<td><label class="bs-cell"><input type="radio" name="bs' + i + '" ' + (val === false ? 'checked' : '') + ' onchange="setBs(' + i + ', false)">S</label></td>';
    html += '</tr>';
  }
  return html + '</tbody></table>';
}

function updateRaguButton() {
  var q = questions[currentQ];
  var btn = document.getElementById('raguBtn');
  var isRagu = !!raguState[q.id];
  btn.classList.toggle('active', isRagu);
  btn.innerHTML = isRagu ? '🚩 Ragu (aktif)' : '🚩 Tandai Ragu';
}

function updateProgress() {
  var total = questions.length;
  var dijawab = questions.filter(isAnswered).length;
  var ragu = Object.keys(raguState).length;
  var kosong = total - dijawab;
  var pct = total ? (dijawab / total) * 100 : 0;
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('sidebarProgressFill').style.width = pct + '%';
  document.getElementById('statDijawab').textContent = dijawab;
  document.getElementById('statRagu').textContent = ragu;
  document.getElementById('statKosong').textContent = kosong;
  document.getElementById('sidebarProgressLabel').textContent = dijawab + ' dari ' + total + ' soal dijawab';
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
  document.getElementById('navGrid').innerHTML = html;
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
    showSync('offline');
    return;
  }
  try {
    var r = await fetch('/api/student/flag', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siswaId: student.siswaId, soalId: q.id, ragu: nextVal })
    });
    if (!r.ok) { pendingRagu[q.id] = nextVal; saveLocalDraft(); }
  } catch (e) {
    pendingRagu[q.id] = nextVal;
    saveLocalDraft();
    showSync('offline');
  }
}
function prevQuestion() { if (currentQ > 0) { currentQ--; renderQuestion(); } }
function nextQuestion() { if (currentQ < questions.length - 1) { currentQ++; renderQuestion(); } }
function goTo(i) {
  currentQ = i; renderQuestion();
  if (window.innerWidth < 1024 && document.getElementById('examSidebar').classList.contains('open')) {
    toggleSidebar();
  }
}

// ============ AUTO-SAVE OFFLINE ============
function queueAnswer(soalId, jawaban) {
  answers[soalId] = jawaban;
  pendingQueue[soalId] = jawaban;
  saveLocalDraft();
  showSync('saving');
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncPending, 400);
}
async function syncPending() {
  if (!navigator.onLine) { showSync('offline'); return; }
  var ids = Object.keys(pendingQueue);
  if (!ids.length) { showSync('saved'); return; }
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
      var r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (r.ok) delete pendingQueue[soalId];
      else if (r.status === 409 || r.status === 410) return;
      else { showSync('error'); return; }
    } catch (e) { showSync('offline'); return; }
  }
  var raguIds = Object.keys(pendingRagu);
  for (var j = 0; j < raguIds.length; j++) {
    var sid = raguIds[j];
    try {
      await fetch('/api/student/flag', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siswaId: student.siswaId, soalId: sid, ragu: pendingRagu[sid] })
      });
      delete pendingRagu[sid];
    } catch (e) { showSync('offline'); return; }
  }
  if (Object.keys(pendingQueue).length === 0) { showSync('saved'); clearLocalDraft(); }
}
function showSync(state) {
  var el = document.getElementById('syncIndicator');
  if (!el) return;
  el.className = 'sync-indicator show ' + state;
  if (state === 'saving') el.textContent = '⟳ Menyimpan';
  else if (state === 'saved') el.textContent = '✓ Tersimpan';
  else if (state === 'offline') el.textContent = '⚠ Offline';
  else if (state === 'error') el.textContent = '⚠ Gagal';
  if (state === 'saved') setTimeout(function () { el.classList.remove('show'); }, 2000);
}
function draftKey() {
  return examMode === 'latihan' ? 'tka_draft_latihan_' + latihanId : 'tka_draft_ujian_' + student.siswaId;
}
function saveLocalDraft() {
  try { localStorage.setItem(draftKey(), JSON.stringify({ queue: pendingQueue, ragu: pendingRagu, ts: Date.now() })); } catch (e) {}
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
      showSync('offline');
      setTimeout(syncPending, 1000);
    }
  } catch (e) {}
}
function clearLocalDraft() {
  try { localStorage.removeItem(draftKey()); } catch (e) {}
}
window.addEventListener('online', function () { showSync('saving'); syncPending(); });
window.addEventListener('offline', function () { showSync('offline'); });
syncInterval = setInterval(function () {
  if (Object.keys(pendingQueue).length > 0 || Object.keys(pendingRagu).length > 0) syncPending();
}, 10000);

// ============ TIMER ============
function startTimer() {
  function tick() {
    var remain = deadline - (Date.now() + serverOffset);
    var el = document.getElementById('timer');
    var txt = document.getElementById('timerText');
    if (remain <= 0) {
      clearInterval(timerHandle);
      txt.textContent = 'HABIS';
      el.className = 'exam-timer danger';
      document.getElementById('nextBtn').disabled = true;
      document.getElementById('prevBtn').disabled = true;
      doSubmit(true);
      return;
    }
    var m = Math.floor(remain / 60000), s = Math.floor((remain % 60000) / 1000);
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
  var msg = '';
  if (unanswered > 0) msg = 'Masih ada ' + unanswered + ' soal belum dijawab.';
  if (raguCount > 0) msg += (msg ? '\n' : '') + 'Ada ' + raguCount + ' soal ditandai ragu-ragu.';
  msg += (msg ? '\n\n' : '') + 'Kirim jawaban sekarang?';
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
  document.getElementById('nextBtn').disabled = true;
  document.getElementById('prevBtn').disabled = true;
  try {
    var url, body;
    if (examMode === 'latihan') {
      url = '/api/student/practice/submit';
      body = { latihanId: latihanId };
    } else {
      url = '/api/student/submit';
      body = { siswaId: student.siswaId };
    }
    var r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    var data = await r.json();
    if (examMode === 'ujian') localStorage.setItem('tka_last_siswaId', student.siswaId);
    else localStorage.setItem('tka_last_latihanId', latihanId);
    localStorage.removeItem(LS_ID); localStorage.removeItem(LS_TOKEN); localStorage.removeItem(LS_LATIHAN);
    clearLocalDraft();
    if (syncInterval) clearInterval(syncInterval);
    document.body.classList.remove('exam-active');
    document.getElementById('examView').classList.add('hidden');
    document.getElementById('doneView').classList.remove('hidden');
    document.getElementById('doneTitle').textContent = examMode === 'latihan' ? 'Latihan Selesai' : 'Ujian Selesai';
    document.getElementById('result').textContent = data.skor + ' / ' + data.total;
    document.getElementById('late').textContent = auto ? 'Waktu habis — jawaban dikirim otomatis.' : (data.late ? 'Catatan: dikirim setelah waktu habis.' : '');
  } catch (e) {
    submitting = false;
    document.getElementById('nextBtn').disabled = false;
    document.getElementById('prevBtn').disabled = false;
    alert('Gagal mengirim. Coba lagi.');
  }
}

// ============ PEMBAHASAN / REVIEW ============
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
      if (!sid) { info.textContent = 'Sesi kamu sudah ditutup.'; return; }
      url = '/api/student/review';
      body = { siswaId: sid };
    }
    var r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    var data = await r.json();
    if (!r.ok) { info.textContent = data.error || 'Gagal'; return; }
    document.getElementById('reviewWho').textContent = data.siswa.nama + ' — ' + (data.siswa.kelas || '-') + '  •  Skor ' + data.skor + ' / ' + data.total;
    var list = document.getElementById('reviewList');
    if (!data.pembahasanDirilis) {
      list.innerHTML = '<div class="review-item" style="background:#fef3c7;color:#92400e;border-left:3px solid #b45309">Pembahasan belum dirilis oleh guru.</div>';
    } else {
      list.innerHTML = data.items.map(renderReviewItem).join('');
      renderMath();
    }
    document.getElementById('doneView').classList.add('hidden');
    document.getElementById('reviewView').classList.remove('hidden');
    info.textContent = '';
  } catch (e) { info.textContent = 'Gagal memuat: ' + e.message; }
}
function renderReviewItem(it) {
  var badge;
  if (it.benar) badge = '<span class="review-badge benar">BENAR</span>';
  else if (it.sebagian) badge = '<span class="review-badge sebagian">SEBAGIAN (' + it.skor + ')</span>';
  else badge = '<span class="review-badge salah">SALAH</span>';
  var html = '<div class="review-item"><div class="review-q"><div class="review-q-text">' + it.nomor + '. ' + escapeHtml(it.q) + '</div>' + badge + '</div>';
  if (it.img) html += '<img class="q-image" src="/gambar/' + encodeURIComponent(it.img) + '" onclick="bukaLightbox(this.src)" alt="">';
  if (it.tipe === 'pg') {
    for (var idx = 0; idx < it.options.length; idx++) {
      var isK = (idx === it.correctIdx);
      var isJ = (idx === it.jawabanSiswa);
      var cls = 'review-opt';
      if (isK) cls += ' kunci';
      if (isJ) cls += ' pilihan';
      var oi = (it.optionImgs && it.optionImgs[idx]) ? '<img class="option-img" src="/gambar/' + encodeURIComponent(it.optionImgs[idx]) + '" onclick="event.stopPropagation(); bukaLightbox(this.src)" alt="">' : '';
      html += '<div class="' + cls + '">' + String.fromCharCode(65 + idx) + '. ' + escapeHtml(it.options[idx] || '') + (isK ? ' (kunci)' : '') + (isJ && !isK ? ' (jawabanmu)' : '') + oi + '</div>';
    }
  } else if (it.tipe === 'mcma') {
    var arr = Array.isArray(it.jawabanSiswa) ? it.jawabanSiswa : [];
    var kunci = it.correctIndices || [];
    for (var idx = 0; idx < it.options.length; idx++) {
      var isK = kunci.indexOf(idx) >= 0;
      var isJ = arr.indexOf(idx) >= 0;
      var cls = 'review-opt';
      if (isK) cls += ' kunci';
      if (isJ && !isK) cls += ' pilihan';
      var mark = '';
      if (isK && isJ) mark = ' (kunci, kamu pilih)';
      else if (isK) mark = ' (kunci, tidak dipilih)';
      else if (isJ) mark = ' (salah dipilih)';
      html += '<div class="' + cls + '">' + String.fromCharCode(65 + idx) + '. ' + escapeHtml(it.options[idx] || '') + mark + '</div>';
    }
  } else if (it.tipe === 'bs') {
    var arrB = Array.isArray(it.jawabanSiswa) ? it.jawabanSiswa : [];
    html += '<table class="bs-table"><thead><tr><th>Pernyataan</th><th>Kunci</th><th>Jawabanmu</th></tr></thead><tbody>';
    for (var i = 0; i < it.pernyataan.length; i++) {
      var p = it.pernyataan[i];
      var jw = arrB[i];
      var teksJw = jw === true ? 'B' : jw === false ? 'S' : '—';
      var cocok = jw === p.key;
      html += '<tr><td>' + escapeHtml(p.teks) + '</td><td style="text-align:center;font-weight:700">' + (p.key ? 'B' : 'S') + '</td><td style="text-align:center;font-weight:700;color:' + (cocok ? 'var(--success)' : 'var(--danger)') + '">' + teksJw + '</td></tr>';
    }
    html += '</tbody></table>';
  }
  if (it.pembahasan) html += '<div class="review-pemb"><b>Pembahasan:</b> ' + escapeHtml(it.pembahasan) + '</div>';
  return html + '</div>';
}

// ============ BEFORE UNLOAD ============
window.addEventListener('beforeunload', function (e) {
  if (!document.getElementById('examView').classList.contains('hidden') && !submitting) {
    if (Object.keys(pendingQueue).length > 0) saveLocalDraft();
    e.preventDefault(); e.returnValue = '';
  }
});

// ============ KEYBOARD SHORTCUTS ============
document.addEventListener('keydown', function (e) {
  if (document.getElementById('examView').classList.contains('hidden')) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'ArrowRight') { e.preventDefault(); nextQuestion(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); prevQuestion(); }
  else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); toggleRagu(); }
});

// ============================================================
// TKA Local Host — server.js
// v11: 3 tipe soal + gambar + QR + analisis + impor siswa CSV
// ============================================================

const express = require('express');
const qrcode  = require('qrcode-terminal');
const qrLib   = require('qrcode');
const os      = require('os');
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');
const { exec } = require('child_process');
const Database = require('better-sqlite3');
const multer   = require('multer');
const archiver = require('archiver');

const app = express();
const PORT = 3000;
let SERVER_IP = 'localhost';

(function detectIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) { SERVER_IP = net.address; return; }
    }
  }
})();

// ============================================================
// Database
// ============================================================
const db = new Database(path.join(__dirname, 'tka.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS sesi (
  id TEXT PRIMARY KEY,
  paket_id TEXT NOT NULL,
  token TEXT NOT NULL,
  durasi_menit INTEGER NOT NULL,
  mulai_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'aktif'
);
CREATE TABLE IF NOT EXISTS siswa_sesi (
  id TEXT PRIMARY KEY,
  sesi_id TEXT NOT NULL,
  nama TEXT NOT NULL,
  kelas TEXT,
  mulai_at INTEGER NOT NULL,
  submit_at INTEGER,
  skor REAL,
  total INTEGER,
  auto_submit INTEGER DEFAULT 0,
  layout TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jawaban (
  siswa_sesi_id TEXT NOT NULL,
  soal_id TEXT NOT NULL,
  pilihan INTEGER,
  jawaban_json TEXT,
  saved_at INTEGER NOT NULL,
  PRIMARY KEY (siswa_sesi_id, soal_id)
);
CREATE TABLE IF NOT EXISTS event_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  siswa_sesi_id TEXT NOT NULL,
  tipe TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS siswa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nisn TEXT,
  nama TEXT NOT NULL,
  kelas TEXT,
  aktif INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS sekolah (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  nama TEXT DEFAULT '',
  npsn TEXT DEFAULT '',
  alamat TEXT DEFAULT '',
  kepsek TEXT DEFAULT '',
  nip TEXT DEFAULT '',
  tahun_ajaran TEXT DEFAULT '',
  logo TEXT DEFAULT '',
  telepon TEXT DEFAULT '',
  email TEXT DEFAULT '',
  website TEXT DEFAULT '',
  setup_done INTEGER DEFAULT 0,
  nama_kegiatan TEXT DEFAULT 'Tryout TKA Mandiri'
);
INSERT OR IGNORE INTO sekolah (id) VALUES (1);

CREATE TABLE IF NOT EXISTS latihan_sesi (
  id TEXT PRIMARY KEY,
  paket_id TEXT NOT NULL,
  nama TEXT NOT NULL,
  kelas TEXT,
  mulai_at INTEGER NOT NULL,
  deadline INTEGER NOT NULL,
  submit_at INTEGER,
  skor REAL,
  total INTEGER,
  layout TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS latihan_jawaban (
  latihan_id TEXT NOT NULL,
  soal_id TEXT NOT NULL,
  jawaban_json TEXT,
  saved_at INTEGER NOT NULL,
  PRIMARY KEY (latihan_id, soal_id)
);
`);

// Migrasi kolom (dijalankan TERPISAH dari db.exec utama)
try { db.exec("ALTER TABLE siswa_sesi ADD COLUMN auto_submit INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE sesi ADD COLUMN rilis_pembahasan INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE jawaban ADD COLUMN jawaban_json TEXT"); } catch {}
try { db.exec("UPDATE jawaban SET jawaban_json = CAST(pilihan AS TEXT) WHERE jawaban_json IS NULL AND pilihan IS NOT NULL"); } catch {}
try { db.exec("ALTER TABLE siswa RENAME COLUMN nis TO nisn"); } catch {}
try { db.exec("ALTER TABLE siswa ADD COLUMN nisn TEXT"); } catch {}
try { db.exec("ALTER TABLE siswa ADD COLUMN aktif INTEGER DEFAULT 1"); } catch {}
try { db.exec("ALTER TABLE sekolah ADD COLUMN npsn TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE sekolah ADD COLUMN tahun_ajaran TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE sekolah ADD COLUMN logo TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE sekolah ADD COLUMN telepon TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE sekolah ADD COLUMN email TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE sekolah ADD COLUMN website TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE sekolah ADD COLUMN setup_done INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE sekolah ADD COLUMN nama_kegiatan TEXT DEFAULT 'Tryout TKA Mandiri'"); } catch {}

function getSetting(key, def) {
  const row = db.prepare("SELECT value FROM settings WHERE key=?").get(key);
  return row ? row.value : (def != null ? def : null);
}
function setSetting(key, value) {
  db.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .run(key, String(value));
}

// ============================================================
// Paket & gambar
// ============================================================
const PAKET_DIR = path.join(__dirname, 'paket');
if (!fs.existsSync(PAKET_DIR)) fs.mkdirSync(PAKET_DIR);

const GAMBAR_DIR = path.join(PAKET_DIR, 'gambar');
if (!fs.existsSync(GAMBAR_DIR)) fs.mkdirSync(GAMBAR_DIR);

// Folder aset sekolah (logo, dll) — TERPISAH dari paket/gambar/
const SEKOLAH_DIR = path.join(__dirname, 'sekolah');
if (!fs.existsSync(SEKOLAH_DIR)) fs.mkdirSync(SEKOLAH_DIR);

const EXTS_GAMBAR = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];

const uploadGambar = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, GAMBAR_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const base = path.basename(file.originalname, ext);
      const safe = base.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 60) || 'gambar';
      let name = safe + ext;
      let i = 1;
      while (fs.existsSync(path.join(GAMBAR_DIR, name))) { name = safe + '-' + i + ext; i++; }
      cb(null, name);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    cb(null, EXTS_GAMBAR.includes(path.extname(file.originalname).toLowerCase()));
  },
});

const uploadLogo = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, SEKOLAH_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const allowed = ['.png', '.jpg', '.jpeg', '.svg', '.webp'];
      if (!allowed.includes(ext)) return cb(new Error('Format tidak didukung (gunakan PNG/JPG)'));
      cb(null, 'logo-sekolah' + ext);
    },
  }),
  limits: { fileSize: 500 * 1024 },
});

function resolveGambar(nama) {
  if (!nama) return null;
  if (/[\/\\]|\.\./.test(nama)) return null;
  const lower = nama.toLowerCase();
  let files;
  try { files = fs.readdirSync(GAMBAR_DIR); } catch { return null; }
  for (const f of files) if (f.toLowerCase() === lower) return f;
  for (const ext of EXTS_GAMBAR) for (const f of files) if (f.toLowerCase() === lower + ext) return f;
  return null;
}

function loadPaket() {
  const map = {};
  for (const f of fs.readdirSync(PAKET_DIR)) {
    if (!f.endsWith('.json')) continue;
    try {
      const p = JSON.parse(fs.readFileSync(path.join(PAKET_DIR, f), 'utf8'));
      if (!p.id || !Array.isArray(p.soal)) throw new Error('id/soal tidak lengkap');
      map[p.id] = p;
    } catch (e) { console.warn('Skip paket', f, '-', e.message); }
  }
  return map;
}
let PAKET = loadPaket();

// Migrasi logo lama: dari paket/gambar/ ke sekolah/
(function migrateOldLogo() {
  try {
    const data = db.prepare("SELECT logo FROM sekolah WHERE id=1").get();
    if (!data || !data.logo) return;
    const oldPath = path.join(GAMBAR_DIR, data.logo);
    const newPath = path.join(SEKOLAH_DIR, data.logo);
    if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
      fs.copyFileSync(oldPath, newPath);
      console.log('✓ Migrasi logo startup:', data.logo, '→ sekolah/');
    }
  } catch (e) { /* ignore */ }
})();

// ============================================================
// Helper umum
// ============================================================
const isLocal = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.ip);
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

function getTipe(soal) {
  const t = (soal.tipe || 'pg').toLowerCase();
  return TIPE_SOAL.includes(t) ? t : 'pg';
}

function getJawabanSiswa(siswaId, soalId) {
  const row = db.prepare("SELECT jawaban_json, pilihan FROM jawaban WHERE siswa_sesi_id=? AND soal_id=?")
    .get(siswaId, soalId);
  if (!row) return null;
  if (row.jawaban_json != null) {
    try { return JSON.parse(row.jawaban_json); }
    catch { return row.pilihan; }
  }
  return row.pilihan;
}

function setJawabanSiswa(siswaId, soalId, jawaban) {
  const json = JSON.stringify(jawaban);
  let primary = -1;
  if (typeof jawaban === 'number') primary = jawaban;
  else if (Array.isArray(jawaban) && jawaban.length > 0 && typeof jawaban[0] === 'number') primary = jawaban[0];
  db.prepare(`
    INSERT INTO jawaban (siswa_sesi_id, soal_id, pilihan, jawaban_json, saved_at)
    VALUES (?,?,?,?,?)
    ON CONFLICT(siswa_sesi_id, soal_id)
    DO UPDATE SET pilihan=excluded.pilihan, jawaban_json=excluded.jawaban_json, saved_at=excluded.saved_at
  `).run(siswaId, soalId, primary, json, Date.now());
}

// ============================================================
// Layout
// ============================================================
function buildLayout(paket) {
  var mode = paket.acakMode || 'per-tipe';
  var soalList = paket.soal.slice();
  if (mode === 'full') {
    soalList = shuffle(soalList);
  } else if (mode === 'per-tipe') {
    var urutanTipe = ['pg', 'mcma', 'bs'];
    var hasil = [];
    urutanTipe.forEach(function(tipe) {
      var group = soalList.filter(function(s) { return getTipe(s) === tipe; });
      hasil = hasil.concat(shuffle(group));
    });
    var lain = soalList.filter(function(s) { return urutanTipe.indexOf(getTipe(s)) < 0; });
    if (lain.length) hasil = hasil.concat(shuffle(lain));
    soalList = hasil;
  }
  return soalList.map(function(s) {
    var tipe = getTipe(s);
    if (tipe === 'bs') {
      var pernyataanOrder = shuffle((s.pernyataan || []).map(function(_, i) { return i; }));
      return { soal_id: s.id, tipe: tipe, pernyataanOrder: pernyataanOrder };
    }
    var order = shuffle((s.options || []).map(function(_, i) { return i; }));
    if (tipe === 'mcma') {
      var kunciArr = Array.isArray(s.key) ? s.key : [s.key];
      var correctIndices = kunciArr.map(function(k) { return order.indexOf(k); }).filter(function(x) { return x >= 0; });
      return { soal_id: s.id, tipe: tipe, optionsOrder: order, correctIndices: correctIndices };
    }
    return { soal_id: s.id, tipe: tipe, optionsOrder: order, correctIdx: order.indexOf(s.key) };
  });
}

// ============================================================
// Scoring
// ============================================================
function scoreSoal(l, soal, jawaban) {
  if (jawaban == null) return 0;
  const tipe = l.tipe || getTipe(soal);
  if (tipe === 'pg') return jawaban === l.correctIdx ? 1 : 0;
  if (tipe === 'mcma') {
    if (!Array.isArray(jawaban)) return 0;
    const kunci = l.correctIndices || [];
    if (jawaban.length !== kunci.length) return 0;
    const setJ = new Set(jawaban), setK = new Set(kunci);
    if (setJ.size !== setK.size) return 0;
    for (const x of setJ) if (!setK.has(x)) return 0;
    return 1;
  }
  if (tipe === 'bs') {
    if (!Array.isArray(jawaban)) return 0;
    const order = l.pernyataanOrder || [];
    if (order.length === 0) return 0;
    let benar = 0;
    for (let i = 0; i < order.length; i++) {
      const origIdx = order[i];
      if (jawaban[i] === soal.pernyataan[origIdx].key) benar++;
    }
    return benar / order.length;
  }
  return 0;
}

function hitungSkor(siswaId) {
  const ss = db.prepare("SELECT * FROM siswa_sesi WHERE id=?").get(siswaId);
  if (!ss) return null;
  const sesi = db.prepare("SELECT * FROM sesi WHERE id=?").get(ss.sesi_id);
  if (!sesi) return null;
  const paket = PAKET[sesi.paket_id];
  if (!paket) return null;
  const layout = JSON.parse(ss.layout);
  const soalMap = Object.fromEntries(paket.soal.map(s => [s.id, s]));
  let skor = 0;
  for (const l of layout) {
    const soal = soalMap[l.soal_id];
    if (!soal) continue;
    skor += scoreSoal(l, soal, getJawabanSiswa(siswaId, l.soal_id));
  }
  return { skor: Math.round(skor * 100) / 100, total: layout.length };
}

// ============================================================
// Siklus sesi
// ============================================================
let autoSubmitTimer = null;

function finalizeStudent(siswaId, auto = false) {
  const ss = db.prepare("SELECT * FROM siswa_sesi WHERE id=?").get(siswaId);
  if (!ss || ss.submit_at) return;
  const { skor, total } = hitungSkor(siswaId);
  db.prepare("UPDATE siswa_sesi SET submit_at=?, skor=?, total=?, auto_submit=? WHERE id=?")
    .run(Date.now(), skor, total, auto ? 1 : 0, siswaId);
}
function finalizeSession(sesiId) {
  const pending = db.prepare("SELECT id FROM siswa_sesi WHERE sesi_id=? AND submit_at IS NULL").all(sesiId);
  for (const s of pending) finalizeStudent(s.id, true);
  db.prepare("UPDATE sesi SET status='selesai' WHERE id=?").run(sesiId);
  if (autoSubmitTimer) { clearTimeout(autoSubmitTimer); autoSubmitTimer = null; }
}
function scheduleAutoSubmit(sesiId, deadline) {
  if (autoSubmitTimer) clearTimeout(autoSubmitTimer);
  const delay = Math.max(0, deadline - Date.now());
  autoSubmitTimer = setTimeout(() => finalizeSession(sesiId), delay + 1000);
}
function ensureDeadline() {
  const sesi = db.prepare("SELECT * FROM sesi WHERE status='aktif' ORDER BY mulai_at DESC LIMIT 1").get();
  if (!sesi) return null;
  if (Date.now() > sesi.mulai_at + sesi.durasi_menit * 60000) { finalizeSession(sesi.id); return null; }
  return sesi;
}

// ============================================================
// Analisis
// ============================================================
function computeAnalisis(sesiId) {
  const sesi = db.prepare("SELECT * FROM sesi WHERE id=?").get(sesiId);
  const paket = PAKET[sesi.paket_id];
  if (!paket) throw new Error('Paket hilang');
  const siswa = db.prepare("SELECT * FROM siswa_sesi WHERE sesi_id=? AND submit_at IS NOT NULL").all(sesiId);
  const soalMap = Object.fromEntries(paket.soal.map(s => [s.id, s]));

  const siswaData = siswa.map(s => {
    const layout = JSON.parse(s.layout);
    const perSoal = {};
    let totalSkor = 0;
    for (const l of layout) {
      const soal = soalMap[l.soal_id];
      if (!soal) continue;
      const j = getJawabanSiswa(s.id, l.soal_id);
      const skor = scoreSoal(l, soal, j);
      perSoal[l.soal_id] = { skor, benar: skor >= 0.999, jawaban: j, layout: l };
      totalSkor += skor;
    }
    return { nama: s.nama, kelas: s.kelas, skor: Math.round(totalSkor * 100) / 100, perSoal };
  });

  const n = siswaData.length;
  const skorArr = siswaData.map(x => x.skor);
  const mean = n ? skorArr.reduce((a, b) => a + b, 0) / n : 0;
  const sorted = [...skorArr].sort((a, b) => a - b);
  const median = n ? (n % 2 ? sorted[Math.floor(n / 2)] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2) : 0;
  const min = n ? sorted[0] : 0;
  const max = n ? sorted[n - 1] : 0;
  const variance = n ? skorArr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n : 0;
  const stddev = Math.sqrt(variance);
  const ranking = [...siswaData].sort((a, b) => b.skor - a.skor);

  const items = paket.soal.map((p, idx) => {
    const tipe = getTipe(p);
    const scoresPerSiswa = siswaData.map(s => s.perSoal[p.id]?.skor || 0);
    const pValue = n ? scoresPerSiswa.reduce((a, b) => a + b, 0) / n : 0;
    const benar = siswaData.filter(s => s.perSoal[p.id]?.benar).length;

    let distraktor = null;
    if (tipe === 'pg') {
      const totalAnswered = siswaData.filter(s => s.perSoal[p.id]?.jawaban != null).length;
      distraktor = p.options.map((opt, i) => {
        let jumlah = 0;
        for (const s of siswaData) {
          const j = s.perSoal[p.id]?.jawaban;
          const l = s.perSoal[p.id]?.layout;
          if (j != null && l && l.optionsOrder && l.optionsOrder[j] === i) jumlah++;
        }
        return { teks: opt || '(gambar)', jumlah, persen: totalAnswered ? jumlah / totalAnswered : 0, adalahKunci: i === p.key };
      });
    }

    let dIndex = null;
    if (n >= 8) {
      const cut = Math.max(1, Math.round(n * 0.27));
      const upper = ranking.slice(0, cut), lower = ranking.slice(-cut);
      const uS = upper.reduce((a, s) => a + (s.perSoal[p.id]?.skor || 0), 0) / cut;
      const lS = lower.reduce((a, s) => a + (s.perSoal[p.id]?.skor || 0), 0) / cut;
      dIndex = uS - lS;
    }

    let levelTingkat = '-';
    if (n > 0) levelTingkat = pValue > 0.7 ? 'mudah' : pValue > 0.3 ? 'sedang' : 'sulit';
    let levelDB = '-';
    if (dIndex != null) levelDB = dIndex >= 0.4 ? 'sangat baik' : dIndex >= 0.3 ? 'baik' : dIndex >= 0.2 ? 'cukup' : 'perlu revisi';

    const flags = [];
    if (n === 0) flags.push('belum ada data');
    else {
      if (pValue > 0.9) flags.push('terlalu mudah');
      if (pValue < 0.2) flags.push('terlalu sulit');
    }
    if (dIndex != null && dIndex < 0) flags.push('daya beda negatif');
    else if (dIndex != null && dIndex < 0.2) flags.push('daya beda rendah');

    return { nomor: idx + 1, soalId: p.id, q: p.q, tipe, pValue, benar, dIndex, levelTingkat, levelDB, flags, distraktor };
  });

  return {
    sesi: { token: sesi.token, paketId: sesi.paket_id, paketJudul: paket.judul, mapel: paket.mapel, totalSoal: paket.soal.length, mulaiAt: sesi.mulai_at },
    jumlahPeserta: n, cukupUntukAnalisis: n >= 8,
    stats: { mean, median, min, max, stddev },
    ranking: ranking.map((r, i) => ({ peringkat: i + 1, nama: r.nama, kelas: r.kelas, skor: r.skor })),
    items,
  };
}

// ============================================================
// CSV parser
// ============================================================
function parseCSV(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  text = text.replace(/^sep=[;,][ \t]*\r?\n/i, '');
  const firstLine = (text.split(/\r?\n/)[0] || '');
  const sep = firstLine.includes(';') ? ';' : ',';
  
  const rows = [];
  let row = [], cur = '', inQ = false;
  
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQ && text[i+1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === sep && !inQ) {
      row.push(cur); cur = '';
    } else if ((c === '\n' || c === '\r') && !inQ) {
      if (c === '\r' && text[i+1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.length > 1 || (row[0] && row[0].trim())) rows.push(row);
      row = [];
    } else {
      cur += c;
    }
  }
  if (cur || row.length) {
    row.push(cur);
    if (row.length > 1 || (row[0] && row[0].trim())) rows.push(row);
  }
  return rows;
}


const KUNCI_MAP = { 'a': 0, 'b': 1, 'c': 2, 'd': 3, '0': 0, '1': 1, '2': 2, '3': 3 };
const TIPE_SOAL = ['pg', 'mcma', 'bs'];

function csvToPaket(csv, meta) {
  const rows = parseCSV(csv);
  if (rows.length < 2) throw new Error('CSV harus punya header + minimal 1 soal');

  const header = rows[0].map(h => h.trim().toLowerCase());
  const idx = {};
  const COLS = ['no','tipe','soal','img','opsi_a','opsi_a_img','opsi_b','opsi_b_img','opsi_c','opsi_c_img','opsi_d','opsi_d_img','kunci','pembahasan'];
  COLS.forEach(k => { idx[k] = header.indexOf(k); });

  if (idx.soal < 0) throw new Error('Header wajib hilang: soal');

  const soal = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const get = (k) => idx[k] >= 0 ? (row[idx[k]] || '').trim() : '';
    const teks = get('soal');
    if (!teks) continue;

    let tipe = (get('tipe') || 'pg').toLowerCase();
    if (!TIPE_SOAL.includes(tipe)) tipe = 'pg';

    const item = {
      id: meta.paketId + '-s' + (soal.length + 1),
      tipe,
      q: teks,
    };
    const img = get('img');
    if (img) item.img = img;
    const imgCaption = get('img_caption');
    if (imgCaption) item.img_caption = imgCaption;
    const imgRef = get('img_ref');
    if (imgRef) item.img_ref = imgRef;
    const wacana = get('wacana');
    if (wacana) item.wacana = wacana;
    const wacanaJudul = get('wacana_judul');
    if (wacanaJudul) item.wacana_judul = wacanaJudul;
    const wacanaSumber = get('wacana_sumber');
    if (wacanaSumber) item.wacana_sumber = wacanaSumber;

    if (tipe === 'bs') {
      const pernyataan = [];
      const kunciRaw = get('kunci').toUpperCase().replace(/[^BS]/g, '');
      ['a', 'b', 'c', 'd'].forEach((col, i) => {
        const p = get('opsi_' + col);
        if (p) pernyataan.push({ teks: p, key: kunciRaw[i] === 'B' });
      });
      if (pernyataan.length < 2) throw new Error('Baris ' + (r+1) + ': BS butuh minimal 2 pernyataan');
      item.pernyataan = pernyataan;
    } else {
      const optTexts = [get('opsi_a'), get('opsi_b'), get('opsi_c'), get('opsi_d')];
      const optImgs = [get('opsi_a_img'), get('opsi_b_img'), get('opsi_c_img'), get('opsi_d_img')];
      let last = -1;
      for (let i = 0; i < 4; i++) if (optTexts[i] || optImgs[i]) last = i;
      if (last < 1) throw new Error('Baris ' + (r+1) + ': minimal 2 opsi');

      item.options = optTexts.slice(0, last + 1);
      if (optImgs.slice(0, last + 1).some(x => x)) item.optionImgs = optImgs.slice(0, last + 1);

      const kunciRaw = get('kunci').toLowerCase().trim();
      if (tipe === 'pg') {
        const k = KUNCI_MAP[kunciRaw];
        if (k == null || k > last) throw new Error('Baris ' + (r+1) + ': kunci tidak valid');
        item.key = k;
      } else {
        const letters = kunciRaw.replace(/[,\s;|]+/g, '').split('').filter(x => x);
        const keys = letters.map(l => {
          const k = KUNCI_MAP[l];
          if (k == null || k > last) throw new Error('Baris ' + (r+1) + ': kunci MCMA tidak valid');
          return k;
        }).sort((a, b) => a - b);
        if (keys.length < 2) throw new Error('Baris ' + (r+1) + ': MCMA butuh minimal 2 kunci');
        item.key = keys;
      }
    }

    const pemb = get('pembahasan');
    if (pemb) item.pembahasan = pemb;

    soal.push(item);
  }

  if (soal.length === 0) throw new Error('Tidak ada soal valid');
  return {
    id: meta.paketId,
    judul: meta.judul,
    mapel: meta.mapel,
    durasiMenit: meta.durasiMenit,
    acakMode: 'per-tipe',
    soal
  };
}

// ============================================================
// Review
// ============================================================
function buildReview(siswaId, guru = false) {
  const ss = db.prepare("SELECT * FROM siswa_sesi WHERE id=?").get(siswaId);
  if (!ss) return { error: 'Sesi tidak ditemukan', code: 404 };
  if (!ss.submit_at) return { error: 'Belum submit', code: 400 };
  const sesi = db.prepare("SELECT * FROM sesi WHERE id=?").get(ss.sesi_id);
  if (!sesi) return { error: 'Sesi ujian hilang', code: 404 };
  const paket = PAKET[sesi.paket_id];
  if (!paket) return { error: 'Paket hilang', code: 500 };

  const layout = JSON.parse(ss.layout);
  const soalMap = Object.fromEntries(paket.soal.map(s => [s.id, s]));
  const bolehLihat = guru || sesi.rilis_pembahasan === 1;

  const items = layout.map((l, i) => {
    const s = soalMap[l.soal_id];
    const tipe = l.tipe || getTipe(s);
    const jawabanSiswa = getJawabanSiswa(siswaId, l.soal_id);
    const skor = scoreSoal(l, s, jawabanSiswa);
    const item = {
      nomor: i + 1, soalId: s.id, q: s.q, tipe,
      skor: Math.round(skor * 100) / 100,
      benar: skor >= 0.999,
      sebagian: skor > 0 && skor < 0.999,
      pembahasan: bolehLihat ? (s.pembahasan || null) : null,
    };
    if (s.img) { const r = resolveGambar(s.img); if (r) item.img = r; }
    if (tipe === 'pg' || tipe === 'mcma') {
      item.options = l.optionsOrder.map(k => s.options[k]);
      if (s.optionImgs) item.optionImgs = l.optionsOrder.map(k => { const raw = s.optionImgs[k]; return raw ? (resolveGambar(raw) || raw) : null; });
      item.jawabanSiswa = jawabanSiswa;
      if (tipe === 'pg') item.correctIdx = l.correctIdx;
      else item.correctIndices = l.correctIndices;
    } else if (tipe === 'bs') {
      item.pernyataan = l.pernyataanOrder.map(origIdx => ({ teks: s.pernyataan[origIdx].teks, key: s.pernyataan[origIdx].key }));
      item.jawabanSiswa = jawabanSiswa;
    }
    return item;
  });

  return { siswa: { nama: ss.nama, kelas: ss.kelas }, skor: ss.skor, total: ss.total, autoSubmit: ss.auto_submit === 1, pembahasanDirilis: bolehLihat, items };
}

// ============================================================
// Auto-backup & browser
// ============================================================
function autoBackup() {
  const dir = path.join(__dirname, 'backups');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dest = path.join(dir, 'tka-' + ts + '.db');
    fs.copyFileSync(path.join(__dirname, 'tka.db'), dest);
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.db')).sort();
    while (files.length > 14) fs.unlinkSync(path.join(dir, files.shift()));
    return dest;
  } catch (e) { console.warn('Auto-backup gagal:', e.message); return null; }
}

function openBrowser(url) {
  try {
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start ""' : 'xdg-open';
    exec(cmd + ' "' + url + '"', (err) => { if (err) console.log('  (Buka manual: ' + url + ')'); });
  } catch (_) {}
}

// ============================================================
// Middleware
// ============================================================
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/gambar', express.static(GAMBAR_DIR, { setHeaders: (res) => res.set('Cache-Control', 'public, max-age=3600') }));
app.get('/favicon.ico', (req, res) => {
  res.redirect(301, '/favicon.svg');
});
// ============================================================
// ENDPOINT GURU
// ============================================================
app.get('/api/public/sekolah', (req, res) => {
  try {
    const s = db.prepare("SELECT nama, logo FROM sekolah WHERE id=1").get();
    res.json({
      nama: (s && s.nama) ? s.nama : 'Try Out TKA Mandiri',
      logo: (s && s.logo) ? s.logo : null
    });
  } catch (e) {
    res.json({ nama: 'Try Out TKA Mandiri', logo: null });
  }
});

app.get('/guru', (req, res) => {
  if (!isLocal(req)) return res.status(403).send('Akses hanya dari laptop guru');
  const sekolah = db.prepare("SELECT setup_done FROM sekolah WHERE id=1").get();
  if (sekolah && sekolah.setup_done === 0) {
    return res.redirect('/setup');
  }
  res.sendFile(path.join(__dirname, 'guru.html'));
});

app.get('/setup', (req, res) => {
  if (!isLocal(req)) return res.status(403).send('Akses hanya dari laptop guru');
  res.sendFile(path.join(__dirname, 'public', 'setup.html'));
});
app.get('/panduan', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'panduan.html'));
});

app.get('/api/teacher/paket', (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'Hanya guru' });
  const list = Object.values(PAKET).map(p => {
    const filePath = path.join(PAKET_DIR, p.id + '.json');
    let created_at = null;
    try { created_at = fs.statSync(filePath).mtimeMs; } catch (e) {}
    return {
      id: p.id, judul: p.judul, mapel: p.mapel,
      jumlahSoal: p.soal.length, durasiMenit: p.durasiMenit,
      latihanMandiri: p.latihanMandiri === true,
      acakMode: p.acakMode || 'per-tipe',
      created_at
    };
  });
  res.json(list);
});

app.post('/api/teacher/reload', (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'Hanya guru' });
  PAKET = loadPaket();
  res.json({ ok: true, jumlahPaket: Object.keys(PAKET).length });
});

app.post('/api/teacher/paket/create', (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'Hanya guru' });
  const { id, judul, mapel, durasiMenit } = req.body;
  if (!id || !/^[a-z0-9-]+$/.test(id)) return res.status(400).json({ error: 'ID paket tidak valid' });
  if (PAKET[id]) return res.status(409).json({ error: 'Paket "' + id + '" sudah ada' });
  const paket = {
    version: '1.0',
    id,
    judul: judul || id,
    mapel: mapel || 'Campuran',
    durasiMenit: Number(durasiMenit) || 15,
    acakMode: 'per-tipe',
    soal: []
  };
  const filePath = path.join(PAKET_DIR, id + '.json');
  fs.writeFileSync(filePath, JSON.stringify(paket, null, 2), 'utf8');
  PAKET = loadPaket();
  res.json({ ok: true, paketId: id });
});

app.get('/api/teacher/paket/:id/preview', (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'Hanya guru' });
  const paket = PAKET[req.params.id];
  if (!paket) return res.status(404).json({ error: 'Paket tidak ditemukan' });
  res.json(paket);
});

app.get('/api/teacher/paket/:id/export-csv', (req, res) => {
  if (!isLocal(req)) return res.status(403).send('Hanya guru');
  const paket = PAKET[req.params.id];
  if (!paket) return res.status(404).send('Paket tidak ditemukan');
  function esc(s) { s = String(s == null ? '' : s); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function huruf(k) { return ['a','b','c','d'][k] || 'a'; }
  const COLS = ['no','tipe','wacana_judul','wacana','wacana_sumber','soal','img','img_caption','img_ref',
    'opsi_a','opsi_a_img','opsi_b','opsi_b_img','opsi_c','opsi_c_img','opsi_d','opsi_d_img','kunci','pembahasan'];
  function rowArr(arr) { return arr.map(esc).join(';'); }
  const header = COLS.join(';') + '\n';
  const rows = paket.soal.map((s, i) => {
    const tipe = getTipe(s);
    const wacana = [s.wacana_judul || '', s.wacana || '', s.wacana_sumber || ''];
    const imgFields = [s.img || '', s.img_caption || '', s.img_ref || ''];
    if (tipe === 'bs') {
      const p = s.pernyataan || [];
      const arr = [i + 1, tipe, ...wacana, s.q || '', ...imgFields,
        p[0] ? p[0].teks : '', '', p[1] ? p[1].teks : '', '',
        p[2] ? p[2].teks : '', '', p[3] ? p[3].teks : '',
        p.map(x => x.key ? 'B' : 'S').join(','), s.pembahasan || ''];
      return rowArr(arr);
    }
    const kunci = tipe === 'mcma' ? (Array.isArray(s.key) ? s.key.map(huruf).join(',') : huruf(s.key)) : huruf(s.key);
    const arr = [i + 1, tipe, ...wacana, s.q || '', ...imgFields,
      (s.options && s.options[0]) || '', (s.optionImgs && s.optionImgs[0]) || '',
      (s.options && s.options[1]) || '', (s.optionImgs && s.optionImgs[1]) || '',
      (s.options && s.options[2]) || '', (s.optionImgs && s.optionImgs[2]) || '',
      (s.options && s.options[3]) || '', (s.optionImgs && s.optionImgs[3]) || '',
      kunci, s.pembahasan || ''];
    return rowArr(arr);
  }).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="' + paket.id + '.csv"');
  res.send('\uFEFFsep=;\n' + header + rows + '\n');
});


app.post('/api/teacher/paket/:id/duplikat', (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'Hanya guru' });
  const paket = PAKET[req.params.id];
  if (!paket) return res.status(404).json({ error: 'Paket tidak ditemukan' });
  const newId = req.body.paketId;
  if (!newId || !/^[a-z0-9-]+$/.test(newId)) return res.status(400).json({ error: 'ID baru tidak valid' });
  const filePath = path.join(PAKET_DIR, newId + '.json');
  if (fs.existsSync(filePath)) return res.status(409).json({ error: `ID "${newId}" sudah dipakai` });
  const baru = {
    id: newId,
    judul: req.body.judul || (paket.judul + ' (salinan)'),
    mapel: req.body.mapel || paket.mapel,
    durasiMenit: Number(req.body.durasiMenit) || paket.durasiMenit,
    soal: paket.soal.map((s, i) => Object.assign({}, s, { id: newId + '-s' + (i + 1) })),
  };
  fs.writeFileSync(filePath, JSON.stringify(baru, null, 2), 'utf8');
  PAKET = loadPaket();
  res.json({ ok: true, paketId: newId, jumlahSoal: baru.soal.length });
});

app.post('/api/teacher/import-csv', (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'Hanya guru' });
  const { paketId, judul, mapel, durasiMenit, csv } = req.body;
  if (!paketId || !/^[a-z0-9-]+$/.test(paketId)) return res.status(400).json({ error: 'ID paket tidak valid' });
  if (!csv || typeof csv !== 'string') return res.status(400).json({ error: 'CSV kosong' });
  const filePath = path.join(PAKET_DIR, paketId + '.json');
  if (fs.existsSync(filePath)) return res.status(409).json({ error: `Paket "${paketId}" sudah ada` });
  try {
    const paket = csvToPaket(csv, { paketId, judul: judul || paketId, mapel: mapel || 'Campuran', durasiMenit: Number(durasiMenit) || 15 });
    fs.writeFileSync(filePath, JSON.stringify(paket, null, 2), 'utf8');
    PAKET = loadPaket();
    res.json({ ok: true, paketId, jumlahSoal: paket.soal.length });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/teacher/hapus-paket', (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'Hanya guru' });
  const { paketId } = req.body;
  if (!paketId || !/^[a-z0-9-]+$/.test(paketId)) return res.status(400).json({ error: 'ID paket tidak valid' });
  const filePath = path.join(PAKET_DIR, paketId + '.json');
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Paket tidak ditemukan' });
  fs.unlinkSync(filePath);
  PAKET = loadPaket();
  res.json({ ok: true });
});

app.get('/api/teacher/template-csv', (req, res) => {
  if (!isLocal(req)) return res.status(403).send('Hanya guru');
  const COLS = ['no','tipe','wacana_judul','wacana','wacana_sumber','soal','img','img_caption','img_ref',
    'opsi_a','opsi_a_img','opsi_b','opsi_b_img','opsi_c','opsi_c_img','opsi_d','opsi_d_img','kunci','pembahasan'];
  function esc(s) { s = String(s == null ? '' : s); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function row(arr) { return arr.map(esc).join(';'); }
  const header = COLS.join(';') + '\n';
  const body = [
    // Contoh 1: PG biasa tanpa wacana
    row([1, 'pg', '', '', '', 'Ibu kota Indonesia adalah...', '', '', '',
      'Bandung', '', 'Jakarta', '', 'Surabaya', '', 'Medan', '', 'B', 'Jakarta adalah ibu kota NKRI']),
    // Contoh 2: MCMA dengan wacana
    row([2, 'mcma', 'Kentus yang Sombong',
      'Di tengah padang rumput terdapat kolam. Kolam itu dihuni banyak katak. Kentus adalah anak katak yang paling besar dan kuat namun sombong.',
      'ceritaanak.org',
      'Apa yang dirasakan Kentus setelah menyadari kesalahannya?', '', '', '',
      'Malu', '', 'Marah', '', 'Menyesal', '', 'Bangga', '', 'A,C',
      'Kentus menunduk dan meminta maaf menunjukkan rasa malu dan penyesalan.']),
    // Contoh 3: PG dengan gambar + caption
    row([3, 'pg', '', '', '', 'Hewan apa yang ditunjukkan gambar?', 'anak-lembu.png', 'Ilustrasi anak lembu', 'anak lembu kartun',
      'Kambing', '', 'Sapi', '', 'Anak Lembu', '', 'Kerbau', '', 'C',
      'Gambar menunjukkan anak lembu.']),
  ].join('\n') + '\n';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="template-soal.csv"');
  res.send('\uFEFFsep=;\n' + header + body);
});


app.get('/api/teacher/template-siswa-csv', (req, res) => {
  if (!isLocal(req)) return res.status(403).send('Hanya guru');
  const csv = 'nisn;nama;kelas\n0012345678;Budi Santoso;VI A\n0012345679;Siti Nurhaliza;VI A\n0012345680;Ahmad Fauzi;VI B\n';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="template-siswa.csv"');
  res.send('\uFEFFsep=;\n' + csv);
});


app.post('/api/teacher/import-siswa-csv', (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'Hanya guru' });
  const { csv, mode } = req.body;
  if (!csv || typeof csv !== 'string') return res.status(400).json({ error: 'CSV kosong' });
  try {
    const list = csvToSiswa(csv);
    if (mode === 'replace') db.prepare("DELETE FROM siswa").run();
    const insert = db.prepare("INSERT INTO siswa (nisn, nama, kelas, created_at) VALUES (?,?,?,?)");
    const tx = db.transaction(() => { for (const s of list) insert.run(s.nisn || '', s.nama, s.kelas || '', Date.now()); });
    tx();
    const total = db.prepare("SELECT COUNT(*) AS n FROM siswa").get().n;
    res.json({ ok: true, ditambahkan: list.length, total });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/teacher/siswa', (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'Hanya guru' });
  const list = db.prepare("SELECT id, nisn, nama, kelas, aktif FROM siswa ORDER BY kelas, nama").all();
  res.json(list);
});

app.post('/api/teacher/siswa/save', (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'Hanya guru' });
  const { id, nisn, nama, kelas } = req.body;
  if (!nama || !nama.trim()) return res.status(400).json({ error: 'Nama wajib diisi' });
  try {
    if (id) {
      db.prepare("UPDATE siswa SET nisn=?, nama=?, kelas=? WHERE id=?")
        .run(nisn || '', nama.trim(), kelas || '', id);
      res.json({ ok: true, id: id });
    } else {
      const result = db.prepare("INSERT INTO siswa (nisn, nama, kelas, aktif, created_at) VALUES (?,?,?,?,?)")
        .run(nisn || '', nama.trim(), kelas || '', 1, Date.now());
      res.json({ ok: true, id: result.lastInsertRowid });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/teacher/toggle-siswa-aktif', (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'Hanya guru' });
  const { id, aktif } = req.body;
  db.prepare("UPDATE siswa SET aktif=? WHERE id=?").run(aktif ? 1 : 0, id);
  res.json({ ok: true });
});

app.post('/api/teacher/hapus-siswa', (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'Hanya guru' });
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'id kosong' });
  db.prepare("DELETE FROM siswa WHERE id=?").run(id);
  res.json({ ok: true });
});

app.post('/api/teacher/clear-siswa', (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'Hanya guru' });
  db.prepare("DELETE FROM siswa").run();
  res.json({ ok: true });
});

app.get('/api/teacher/settings', (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'Hanya guru' });
  res.json({ wajibSiswaTerdaftar: getSetting('wajib_siswa_terdaftar', '0') === '1' });
});

app.post('/api/teacher/toggle-wajib-siswa', (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'Hanya guru' });
  const { aktif } = req.body;
  setSetting('wajib_siswa_terdaftar', aktif ? '1' : '0');
  res.json({ ok: true, wajibSiswaTerdaftar: !!aktif });
});

app.get('/api/teacher/template-siswa-csv', (req, res) => {
  if (!isLocal(req)) return res.status(403).send('Hanya guru');
  const csv = 'nisn;nama;kelas\n0012345678;Budi Santoso;VI A\n0012345679;Siti Nurhaliza;VI A\n0012345680;Ahmad Fauzi;VI B\n';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="template-siswa.csv"');
  res.send('\uFEFFsep=;\n' + csv);
});

app.post('/api/teacher/import-siswa-csv', (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'Hanya guru' });
  const { csv, mode } = req.body;
  if (!csv || typeof csv !== 'string') return res.status(400).json({ error: 'CSV kosong' });
  try {
    const list = csvToSiswa(csv);
    if (mode === 'replace') db.prepare("DELETE FROM siswa").run();
    const insert = db.prepare("INSERT INTO siswa (nisn, nama, kelas, aktif, created_at) VALUES (?,?,?,?,?)");
    const tx = db.transaction(() => { for (const s of list) insert.run(s.nisn || '', s.nama, s.kelas || '', 1, Date.now()); });
    tx();
    const total = db.prepare("SELECT COUNT(*) AS n FROM siswa").get().n;
    res.json({ ok: true, ditambahkan: list.length, total });
  } catch (e) { res.status(400).json({ error: e.message }); }
});


// ============================================================
// RESTORED ROUTES (v18.31)
// ============================================================
app.post('/api/teacher/upload-gambar', (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'Hanya guru' });
  uploadGambar.array('files', 50)(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    const files = (req.files || []).map(f => ({ nama: f.filename, ukuran: f.size, url: '/gambar/' + f.filename }));
    res.json({ ok: true, files });
  });
});

app.get('/api/teacher/gambar', (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'Hanya guru' });
  const files = fs.readdirSync(GAMBAR_DIR)
    .filter(f => EXTS_GAMBAR.includes(path.extname(f).toLowerCase()))
    .map(f => ({ nama: f, ukuran: fs.statSync(path.join(GAMBAR_DIR, f)).size, url: '/gambar/' + f }));
  res.json(files);
});

app.post('/api/teacher/hapus-gambar', (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'Hanya guru' });
  const { nama } = req.body;
  if (!nama || /[\/\\]|\.\./.test(nama)) return res.status(400).json({ error: 'Nama tidak valid' });
  const fp = path.join(GAMBAR_DIR, nama);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'File tidak ditemukan' });
  fs.unlinkSync(fp);
  res.json({ ok: true });
});

app.post('/api/teacher/start', (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'Hanya guru' });
  const paket = PAKET[req.body.paketId];
  if (!paket) return res.status(400).json({ error: 'Paket tidak ditemukan' });
  autoBackup();
  const sesiLama = db.prepare("SELECT id FROM sesi WHERE status='aktif'").get();
  if (sesiLama) finalizeSession(sesiLama.id);
  const id = crypto.randomUUID();
  const token = crypto.randomBytes(4).toString('hex').toUpperCase();
  const now = Date.now();
  db.prepare(`INSERT INTO sesi (id, paket_id, token, durasi_menit, mulai_at, status) VALUES (?,?,?,?,?,'aktif')`)
    .run(id, paket.id, token, paket.durasiMenit, now);
  scheduleAutoSubmit(id, now + paket.durasiMenit * 60000);
  res.json({ ok: true, sesiId: id, token, durasiMenit: paket.durasiMenit, mulaiAt: now });
});

app.post('/api/teacher/stop', (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'Hanya guru' });
  const sesi = db.prepare("SELECT id FROM sesi WHERE status='aktif'").get();
  if (sesi) finalizeSession(sesi.id);
  res.json({ ok: true });
});

app.get('/api/teacher/live', (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'Hanya guru' });
  const sesi = ensureDeadline();
  const wajib = getSetting('wajib_siswa_terdaftar', '0') === '1';
  const totalTerdaftar = db.prepare("SELECT COUNT(*) AS n FROM siswa").get().n;
  const daftarSiswa = db.prepare("SELECT id, nisn, nama, kelas FROM siswa ORDER BY kelas, nama").all();

  if (!sesi) return res.json({ aktif: false, wajibTerdaftar: wajib, totalTerdaftar, daftarSiswa });

  const paket = PAKET[sesi.paket_id];
  const siswa = db.prepare(`
    SELECT ss.id, ss.nama, ss.kelas, ss.mulai_at, ss.submit_at, ss.skor, ss.total, ss.auto_submit,
           (SELECT COUNT(*) FROM jawaban j WHERE j.siswa_sesi_id = ss.id) AS dijawab,
           (SELECT COUNT(*) FROM event_log e WHERE e.siswa_sesi_id = ss.id AND e.tipe='tab_blur') AS pelanggaran
    FROM siswa_sesi ss WHERE ss.sesi_id = ? ORDER BY ss.mulai_at
  `).all(sesi.id);

  const joined = new Set(siswa.map(s => (s.nama || '').toLowerCase().trim()));
  const belumMasuk = daftarSiswa.filter(s => !joined.has((s.nama || '').toLowerCase().trim()));

  res.json({
    aktif: true,
    sesi: {
      id: sesi.id, token: sesi.token, paketId: sesi.paket_id,
      paketJudul: paket?.judul || '-', durasiMenit: sesi.durasi_menit,
      mulaiAt: sesi.mulai_at, deadline: sesi.mulai_at + sesi.durasi_menit * 60000,
      totalSoal: paket?.soal.length || 0,
    },
    siswa, wajibTerdaftar: wajib, totalTerdaftar, daftarSiswa, belumMasuk,
  });
});

app.post('/api/teacher/hapus-peserta', (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'Hanya guru' });
  const { siswaId } = req.body;
  if (!siswaId) return res.status(400).json({ error: 'siswaId kosong' });
  db.prepare("DELETE FROM jawaban WHERE siswa_sesi_id=?").run(siswaId);
  db.prepare("DELETE FROM event_log WHERE siswa_sesi_id=?").run(siswaId);
  db.prepare("DELETE FROM siswa_sesi WHERE id=?").run(siswaId);
  res.json({ ok: true });
});

app.get('/api/teacher/export', (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'Hanya guru' });
  const sesi = db.prepare("SELECT * FROM sesi ORDER BY mulai_at DESC LIMIT 1").get();
  if (!sesi) return res.status(400).send('Belum ada sesi');
  const rows = db.prepare('SELECT nama, kelas, skor, total, auto_submit, submit_at FROM siswa_sesi WHERE sesi_id=? ORDER BY submit_at IS NULL, submit_at').all(sesi.id);
  function esc(s) { s = String(s == null ? '' : s); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  const header = 'Nama;Kelas;Skor;Total;AutoSubmit;WaktuSubmit\n';
  const body = rows.map(r => {
    return esc(r.nama) + ';' + esc(r.kelas || '') + ';' + (r.skor != null ? r.skor : '') + ';' + (r.total != null ? r.total : '') + ';' + (r.auto_submit ? 'YA' : 'tidak') + ';' + (r.submit_at ? new Date(r.submit_at).toISOString() : '');
  }).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="hasil-' + sesi.token + '.csv"');
  res.send('\uFEFFsep=;\n' + header + body);
});


app.get('/api/teacher/analisis', (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'Hanya guru' });
  const sesi = db.prepare("SELECT * FROM sesi ORDER BY mulai_at DESC LIMIT 1").get();
  if (!sesi) return res.status(400).json({ error: 'Belum ada sesi' });
  try { res.json(computeAnalisis(sesi.id)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/teacher/analisis/export', (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'Hanya guru' });
  const sesi = db.prepare("SELECT * FROM sesi ORDER BY mulai_at DESC LIMIT 1").get();
  if (!sesi) return res.status(400).send('Belum ada sesi');
  let d;
  try { d = computeAnalisis(sesi.id); } catch (e) { return res.status(500).send(e.message); }
  function esc(s) { s = String(s == null ? '' : s); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  const header = 'No;Tipe;Soal;p-value;Tingkat;D-index;Daya Beda;Benar;Flag\n';
  const body = d.items.map(it => {
    return it.nomor + ';' + it.tipe + ';' + esc(it.q) + ';' + it.pValue.toFixed(3) + ';' + it.levelTingkat + ';' + (it.dIndex != null ? it.dIndex.toFixed(3) : '') + ';' + it.levelDB + ';' + it.benar + ';' + esc(it.flags.join(', '));
  }).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="analisis-' + sesi.token + '.csv"');
  res.send('\uFEFFsep=;\n' + header + body);
});


app.post('/api/teacher/rilis-pembahasan', (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'Hanya guru' });
  const sesi = db.prepare("SELECT id FROM sesi ORDER BY mulai_at DESC LIMIT 1").get();
  if (!sesi) return res.status(400).json({ error: 'Belum ada sesi' });
  db.prepare("UPDATE sesi SET rilis_pembahasan=1 WHERE id=?").run(sesi.id);
  res.json({ ok: true });
});

app.get('/api/teacher/review/:siswaId', (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'Hanya guru' });
  const r = buildReview(req.params.siswaId, true);
  if (r.error) return res.status(r.code).json({ error: r.error });
  res.json(r);
});

app.get('/api/teacher/backup', (req, res) => {
  if (!isLocal(req)) return res.status(403).send('Hanya guru');
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="tka-backup-${ts}.zip"`);
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => { console.error(err); try { res.end(); } catch (_) {} });
    archive.pipe(res);
    archive.file(path.join(__dirname, 'tka.db'), { name: 'tka.db' });
    archive.directory(PAKET_DIR, 'paket');
    archive.finalize();
  } catch (e) { res.status(500).send(e.message); }
});

app.get('/api/teacher/info', (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'Hanya guru' });
  res.json({ ip: SERVER_IP, port: PORT, urlSiswa: 'http://' + SERVER_IP + ':' + PORT, urlGuru: 'http://localhost:' + PORT + '/guru' });
});

app.get('/api/teacher/qr', async (req, res) => {
  if (!isLocal(req)) return res.status(403).send('Hanya guru');
  try {
    const url = 'http://' + SERVER_IP + ':' + PORT;
    const dataUrl = await qrLib.toDataURL(url, { width: 500, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#1e3a8a', light: '#ffffff' } });
    res.json({ url, dataUrl });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ============================================================
// RESET APLIKASI (FACTORY RESET)
// ============================================================
app.post('/api/teacher/reset-system', (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'Hanya guru' });
  try {
    // 1. Backup dulu sebelum dihapus
    autoBackup();
    
    // 2. Tutup koneksi database
    db.close();
    
    // 3. Hapus file database
    const dbPath = path.join(__dirname, 'tka.db');
    const walPath = dbPath + '-wal';
    const shmPath = dbPath + '-shm';
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
    if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
    
    // 4. Hapus isi folder paket, gambar, dan sekolah
    function clearFolder(dir) {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const fp = path.join(dir, file);
          if (fs.lstatSync(fp).isFile()) fs.unlinkSync(fp);
        }
      }
    }
    clearFolder(PAKET_DIR);
    clearFolder(GAMBAR_DIR);
    const SEKOLAH_DIR = path.join(__dirname, 'sekolah');
    if (fs.existsSync(SEKOLAH_DIR)) clearFolder(SEKOLAH_DIR);
    
    res.json({ ok: true, message: 'Reset berhasil. Server akan berhenti.' });
    
    // 5. Matikan server agar bisa dijalankan ulang dengan database kosong
    setTimeout(() => {
      console.log('\n[RESET] Aplikasi telah di-reset ke pengaturan pabrik. Server berhenti.\n');
      process.exit(0);
    }, 1500);
    
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/teacher/shutdown', (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'Hanya guru' });
  res.json({ ok: true });
  setTimeout(() => { console.log('\n[shutdown] Server berhenti.\n'); process.exit(0); }, 1000);
});
// ============================================================
// EDITOR PAKET (v12)
// ============================================================
function validasiPaket(paket) {
  if (!paket || typeof paket !== 'object') throw new Error('Data paket kosong');
  if (!paket.id || !/^[a-z0-9-]+$/.test(paket.id)) throw new Error('ID paket tidak valid');
  if (!paket.judul || !paket.judul.trim()) throw new Error('Judul wajib diisi');
  if (!Array.isArray(paket.soal)) throw new Error('Field soal harus array');
  if (paket.acakMode && ['full','per-tipe','none'].indexOf(paket.acakMode) < 0) {
    throw new Error('acakMode harus salah satu: full, per-tipe, none');
  }

  for (let i = 0; i < paket.soal.length; i++) {
    const s = paket.soal[i];
    const no = i + 1;
    if (!s.q || !s.q.trim()) throw new Error('Soal #' + no + ': teks kosong');
    const tipe = s.tipe || 'pg';

    if (tipe === 'pg') {
      if (!Array.isArray(s.options) || s.options.length < 2)
        throw new Error('Soal #' + no + ': minimal 2 opsi');
      if (typeof s.key !== 'number' || s.key < 0 || s.key >= s.options.length)
        throw new Error('Soal #' + no + ': kunci belum dipilih');
    } else if (tipe === 'mcma') {
      if (!Array.isArray(s.options) || s.options.length < 2)
        throw new Error('Soal #' + no + ': minimal 2 opsi');
      if (!Array.isArray(s.key) || s.key.length < 2)
        throw new Error('Soal #' + no + ': MCMA butuh minimal 2 kunci');
      for (const k of s.key) {
        if (typeof k !== 'number' || k < 0 || k >= s.options.length)
          throw new Error('Soal #' + no + ': kunci MCMA tidak valid');
      }
    } else if (tipe === 'bs') {
      if (!Array.isArray(s.pernyataan) || s.pernyataan.length < 2)
        throw new Error('Soal #' + no + ': BS butuh minimal 2 pernyataan');
      for (const p of s.pernyataan) {
        if (!p.teks || !p.teks.trim()) throw new Error('Soal #' + no + ': ada pernyataan kosong');
        if (typeof p.key !== 'boolean') throw new Error('Soal #' + no + ': kunci B/S belum dipilih');
      }
    } else {
      throw new Error('Soal #' + no + ': tipe tidak dikenal');
    }
  }
  return true;
}

app.put('/api/teacher/paket/:id', (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'Hanya guru' });
  const paket = req.body;
  if (!paket || paket.id !== req.params.id) return res.status(400).json({ error: 'ID tidak cocok' });
  try {
    validasiPaket(paket);
    const filePath = path.join(PAKET_DIR, paket.id + '.json');
    fs.writeFileSync(filePath, JSON.stringify(paket, null, 2), 'utf8');
    PAKET = loadPaket();
    res.json({ ok: true, jumlahSoal: paket.soal.length });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ============================================================
// FLAG RAGU-RAGU (v16)
// ============================================================
app.post('/api/student/flag', (req, res) => {
  const { siswaId, soalId, ragu } = req.body;
  if (!siswaId || !soalId) return res.status(400).json({ error: 'Data kurang' });
  const s = db.prepare("SELECT * FROM siswa_sesi WHERE id=?").get(siswaId);
  if (!s) return res.status(404).json({ error: 'Sesi tidak ditemukan' });
  if (s.submit_at) return res.status(409).json({ error: 'Sudah submit' });

  let flags = {};
  try { flags = JSON.parse(s.ragu_json || '{}'); } catch {}
  if (ragu) flags[soalId] = true;
  else delete flags[soalId];
  db.prepare("UPDATE siswa_sesi SET ragu_json=? WHERE id=?").run(JSON.stringify(flags), siswaId);
  res.json({ ok: true });
});

// ============================================================
// LATIHAN MANDIRI (v15)
// ============================================================
app.get('/api/student/paket-latihan', (req, res) => {
  const list = Object.values(PAKET)
    .filter(p => p.latihanMandiri === true)
    .map(p => ({
      id: p.id, judul: p.judul, mapel: p.mapel,
      jumlahSoal: p.soal.length, durasiMenit: p.durasiMenit,
    }));
  res.json(list);
});

app.post('/api/student/practice/join', (req, res) => {
  const { paketId, nama, kelas } = req.body;
  if (!paketId || !nama || !nama.trim())
    return res.status(400).json({ error: 'Nama dan paket wajib diisi' });
  const paket = PAKET[paketId];
  if (!paket) return res.status(404).json({ error: 'Paket tidak ditemukan' });
  if (!paket.latihanMandiri)
    return res.status(403).json({ error: 'Paket tidak tersedia untuk latihan mandiri' });

  const layout = buildLayout(paket);
  const latihanId = crypto.randomUUID();
  const sekarang = Date.now();
  const deadline = sekarang + paket.durasiMenit * 60000;

  db.prepare(`INSERT INTO latihan_sesi (id, paket_id, nama, kelas, mulai_at, deadline, layout)
              VALUES (?,?,?,?,?,?,?)`)
    .run(latihanId, paketId, nama.trim(), (kelas || '').trim(), sekarang, deadline, JSON.stringify(layout));

  const soalMap = Object.fromEntries(paket.soal.map(s => [s.id, s]));
  const questions = layout.map(l => {
    const s = soalMap[l.soal_id];
    const tipe = l.tipe || getTipe(s);
    const q = { id: s.id, q: s.q, tipe };
    if (s.img) { const r = resolveGambar(s.img); if (r) q.img = r; }
    if (s.img_caption) q.img_caption = s.img_caption;
    if (s.wacana) q.wacana = s.wacana;
    if (s.wacana_judul) q.wacana_judul = s.wacana_judul;
    if (s.wacana_sumber) q.wacana_sumber = s.wacana_sumber;
    if (s.img_caption) q.img_caption = s.img_caption;
    if (s.wacana) q.wacana = s.wacana;
    if (s.wacana_judul) q.wacana_judul = s.wacana_judul;
    if (s.wacana_sumber) q.wacana_sumber = s.wacana_sumber;
    if (s.img_caption) q.img_caption = s.img_caption;
    if (s.wacana) q.wacana = s.wacana;
    if (s.wacana_judul) q.wacana_judul = s.wacana_judul;
    if (s.wacana_sumber) q.wacana_sumber = s.wacana_sumber;
    if (tipe === 'pg' || tipe === 'mcma') {
      q.options = l.optionsOrder.map(k => s.options[k]);
      if (s.optionImgs) q.optionImgs = l.optionsOrder.map(k => {
        const raw = s.optionImgs[k];
        return raw ? (resolveGambar(raw) || raw) : null;
      });
    } else if (tipe === 'bs') {
      q.pernyataan = l.pernyataanOrder.map(origIdx => s.pernyataan[origIdx].teks);
    }
    return q;
  });

  res.json({
    latihanId, nama: nama.trim(), kelas: (kelas || '').trim(),
    deadline, serverNow: sekarang,
    durasiMenit: paket.durasiMenit,
    totalSoal: questions.length, questions,
  });
});

app.post('/api/student/practice/answer', (req, res) => {
  const { latihanId, soalId, jawaban } = req.body;
  const s = db.prepare("SELECT * FROM latihan_sesi WHERE id=?").get(latihanId);
  if (!s) return res.status(404).json({ error: 'Sesi latihan tidak ditemukan' });
  if (s.submit_at) return res.status(409).json({ error: 'Sudah submit' });
  if (Date.now() > s.deadline) return res.status(410).json({ error: 'Waktu habis' });

  const layout = JSON.parse(s.layout);
  const l = layout.find(x => x.soal_id === soalId);
  if (!l) return res.status(400).json({ error: 'Soal tidak dikenal' });

  db.prepare(`
    INSERT INTO latihan_jawaban (latihan_id, soal_id, jawaban_json, saved_at)
    VALUES (?,?,?,?)
    ON CONFLICT(latihan_id, soal_id)
    DO UPDATE SET jawaban_json=excluded.jawaban_json, saved_at=excluded.saved_at
  `).run(latihanId, soalId, JSON.stringify(jawaban), Date.now());

  res.json({ ok: true });
});

function hitungSkorLatihan(latihanId) {
  const s = db.prepare("SELECT * FROM latihan_sesi WHERE id=?").get(latihanId);
  if (!s) return { skor: 0, total: 0 };
  const paket = PAKET[s.paket_id];
  if (!paket) return { skor: 0, total: 0 };
  const layout = JSON.parse(s.layout);
  const soalMap = Object.fromEntries(paket.soal.map(x => [x.id, x]));

  let skor = 0;
  for (const l of layout) {
    const soal = soalMap[l.soal_id];
    if (!soal) continue;
    const row = db.prepare("SELECT jawaban_json FROM latihan_jawaban WHERE latihan_id=? AND soal_id=?")
      .get(latihanId, l.soal_id);
    const jawaban = row ? JSON.parse(row.jawaban_json) : null;
    skor += scoreSoal(l, soal, jawaban);
  }
  return { skor: Math.round(skor * 100) / 100, total: layout.length };
}

app.post('/api/student/practice/submit', (req, res) => {
  const { latihanId } = req.body;
  const s = db.prepare("SELECT * FROM latihan_sesi WHERE id=?").get(latihanId);
  if (!s) return res.status(404).json({ error: 'Sesi latihan tidak ditemukan' });
  if (s.submit_at) return res.json({ skor: s.skor, total: s.total, sudah: true });

  const { skor, total } = hitungSkorLatihan(latihanId);
  db.prepare("UPDATE latihan_sesi SET submit_at=?, skor=?, total=? WHERE id=?")
    .run(Date.now(), skor, total, latihanId);
  res.json({ skor, total, late: false });
});

app.post('/api/student/practice/review', (req, res) => {
  const { latihanId } = req.body;
  const s = db.prepare("SELECT * FROM latihan_sesi WHERE id=?").get(latihanId);
  if (!s) return res.status(404).json({ error: 'Sesi latihan tidak ditemukan' });
  if (!s.submit_at) return res.status(400).json({ error: 'Belum submit' });

  const paket = PAKET[s.paket_id];
  if (!paket) return res.status(500).json({ error: 'Paket hilang' });

  const layout = JSON.parse(s.layout);
  const soalMap = Object.fromEntries(paket.soal.map(x => [x.id, x]));

  const items = layout.map((l, i) => {
    const soal = soalMap[l.soal_id];
    const tipe = l.tipe || getTipe(soal);
    const row = db.prepare("SELECT jawaban_json FROM latihan_jawaban WHERE latihan_id=? AND soal_id=?")
      .get(latihanId, l.soal_id);
    const jawaban = row ? JSON.parse(row.jawaban_json) : null;
    const skor = scoreSoal(l, soal, jawaban);

    const item = {
      nomor: i + 1, soalId: soal.id, q: soal.q, tipe,
      skor: Math.round(skor * 100) / 100,
      benar: skor >= 0.999,
      sebagian: skor > 0 && skor < 0.999,
      pembahasan: soal.pembahasan || null,
    };
    if (soal.img) {
      const r = resolveGambar(soal.img);
      if (r) item.img = r;
    }
    if (tipe === 'pg' || tipe === 'mcma') {
      item.options = l.optionsOrder.map(k => soal.options[k]);
      if (soal.optionImgs) item.optionImgs = l.optionsOrder.map(k => {
        const raw = soal.optionImgs[k];
        return raw ? (resolveGambar(raw) || raw) : null;
      });
      item.jawabanSiswa = jawaban;
      if (tipe === 'pg') item.correctIdx = l.correctIdx;
      else item.correctIndices = l.correctIndices;
    } else if (tipe === 'bs') {
      item.pernyataan = l.pernyataanOrder.map(origIdx => ({
        teks: soal.pernyataan[origIdx].teks,
        key: soal.pernyataan[origIdx].key,
      }));
      item.jawabanSiswa = jawaban;
    }
    return item;
  });

  res.json({
    siswa: { nama: s.nama, kelas: s.kelas },
    skor: s.skor, total: s.total,
    autoSubmit: false,
    pembahasanDirilis: true,
    items,
  });
});

app.post('/api/teacher/toggle-latihan', (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'Hanya guru' });
  const { paketId, aktif } = req.body;
  const paket = PAKET[paketId];
  if (!paket) return res.status(404).json({ error: 'Paket tidak ditemukan' });
  paket.latihanMandiri = !!aktif;
  const filePath = path.join(PAKET_DIR, paketId + '.json');
  fs.writeFileSync(filePath, JSON.stringify(paket, null, 2), 'utf8');
  PAKET = loadPaket();
  res.json({ ok: true, latihanMandiri: paket.latihanMandiri });
});


// ============================================================
// ADMINISTRASI CETAK (v18.12)
// ============================================================
app.get('/api/teacher/sekolah', (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'Hanya guru' });
  const data = db.prepare("SELECT * FROM sekolah WHERE id=1").get();
  res.json(data || {});
});

app.post('/api/teacher/sekolah', (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'Hanya guru' });
  const { nama, npsn, alamat, kepsek, nip, tahun_ajaran, telepon, email, website, nama_kegiatan } = req.body;
  const setupDone = (nama && npsn) ? 1 : 2;
  db.prepare(`UPDATE sekolah SET nama=?, npsn=?, alamat=?, kepsek=?, nip=?, tahun_ajaran=?, telepon=?, email=?, website=?, nama_kegiatan=?, setup_done=? WHERE id=1`)
    .run(nama || '', npsn || '', alamat || '', kepsek || '', nip || '', tahun_ajaran || '', telepon || '', email || '', website || '', nama_kegiatan || 'Tryout TKA Mandiri', setupDone);
  res.json({ ok: true, setup_done: setupDone });
});

// ============================================================
// SETUP WIZARD & PROFIL SEKOLAH (v18.16)
// ============================================================
app.get('/api/teacher/setup-status', (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'Hanya guru' });
  const data = db.prepare("SELECT setup_done FROM sekolah WHERE id=1").get();
  res.json({ setup_done: data ? data.setup_done : 0 });
});

app.post('/api/teacher/skip-setup', (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'Hanya guru' });
  db.prepare("UPDATE sekolah SET setup_done=2 WHERE id=1").run();
  res.json({ ok: true });
});

app.post('/api/teacher/upload-logo', (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'Hanya guru' });
  uploadLogo.single('logo')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'File tidak ada' });
    db.prepare("UPDATE sekolah SET logo=? WHERE id=1").run(req.file.filename);
    res.json({ ok: true, filename: req.file.filename });
  });
});

app.get('/logo-sekolah', (req, res) => {
  const data = db.prepare("SELECT logo FROM sekolah WHERE id=1").get();
  if (!data || !data.logo) return res.status(404).send('Belum ada logo');
  let fp = path.join(SEKOLAH_DIR, data.logo);
  if (!fs.existsSync(fp)) {
    const oldPath = path.join(GAMBAR_DIR, data.logo);
    if (fs.existsSync(oldPath)) {
      try {
        fs.copyFileSync(oldPath, path.join(SEKOLAH_DIR, data.logo));
        fp = path.join(SEKOLAH_DIR, data.logo);
        console.log('Migrasi logo:', data.logo, '→ sekolah/');
      } catch (e) { fp = oldPath; }
    } else {
      return res.status(404).send('File logo tidak ditemukan');
    }
  }
  res.sendFile(fp);
});

app.get('/api/teacher/admin-data', async (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'Hanya guru' });
  const paketId = req.query.paketId;
  const paket = PAKET[paketId];
  if (!paket) return res.status(404).json({ error: 'Paket tidak ditemukan' });
  const siswa = db.prepare("SELECT id, nisn, nama, kelas FROM siswa ORDER BY kelas, nama").all();
  const sekolah = db.prepare("SELECT * FROM sekolah WHERE id=1").get();
  const sesi = db.prepare("SELECT * FROM sesi WHERE paket_id=? ORDER BY mulai_at DESC LIMIT 1").get(paketId);
  
  let qrUrl = null;
  let kehadiran = { total: siswa.length, hadir: 0, tidakHadir: siswa.length };
  
  if (sesi) {
    try {
      const url = 'http://' + SERVER_IP + ':' + PORT + '/?t=' + sesi.token;
      qrUrl = await qrLib.toDataURL(url, { width: 250, margin: 1, errorCorrectionLevel: 'M' });
    } catch (e) {}
    
    // Hitung kehadiran dari tabel siswa_sesi
    const hadirCount = db.prepare("SELECT COUNT(*) AS n FROM siswa_sesi WHERE sesi_id=?").get(sesi.id).n;
    kehadiran.hadir = hadirCount;
    kehadiran.tidakHadir = Math.max(0, siswa.length - hadirCount);
  }
  
  res.json({
    paket: { id: paket.id, judul: paket.judul, mapel: paket.mapel, durasi: paket.durasiMenit },
    siswa, sekolah, kehadiran,
    sesi: sesi ? { token: sesi.token, mulaiAt: sesi.mulai_at, qrUrl } : null,
    serverUrl: 'http://' + SERVER_IP + ':' + PORT
  });
});

app.get('/administrasi', (req, res) => {
  if (!isLocal(req)) return res.status(403).send('Akses hanya dari laptop guru');
  res.sendFile(path.join(__dirname, 'public', 'administrasi.html'));
});



function csvToSiswa(csv) {
  const rows = parseCSV(csv);
  if (rows.length < 2) throw new Error('CSV harus punya header + minimal 1 siswa');
  const header = rows[0].map(h => h.trim().toLowerCase());
  const idx = {
    nisn: header.indexOf('nisn') >= 0 ? header.indexOf('nisn') : header.indexOf('nis'),
    nama: header.indexOf('nama'),
    kelas: header.indexOf('kelas')
  };
  if (idx.nama < 0) throw new Error('Header wajib hilang: nama');
  const list = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const get = (k) => idx[k] >= 0 ? (row[idx[k]] || '').trim() : '';
    const nama = get('nama');
    if (!nama) continue;
    list.push({ nisn: get('nisn'), nama, kelas: get('kelas') });
  }
  if (list.length === 0) throw new Error('Tidak ada siswa valid');
  return list;
}

// ============================================================
// VALIDASI JSON DARI TKA STUDIO (v18.14)
// ============================================================
function validasiPaketJSON(paket) {
  const errors = [];
  if (!paket || typeof paket !== 'object') {
    throw new Error('File JSON tidak valid (bukan object)');
  }
  if (!paket.id || !/^[a-z0-9-]+$/.test(paket.id)) {
    errors.push('Field "id" wajib huruf kecil, angka, minus (contoh: matematika-pecahan-2026)');
  }
  if (!paket.judul || !paket.judul.trim()) {
    errors.push('Field "judul" wajib diisi');
  }
  if (!paket.mapel || !paket.mapel.trim()) {
    errors.push('Field "mapel" wajib diisi');
  }
  if (!Number.isFinite(paket.durasiMenit) || paket.durasiMenit <= 0) {
    errors.push('Field "durasiMenit" wajib angka positif');
  }
  if (!Array.isArray(paket.soal) || paket.soal.length === 0) {
    errors.push('Field "soal" wajib array minimal 1 soal');
  }
  if (errors.length) throw new Error(errors.join('\n'));

  const seenIds = new Set();
  paket.soal.forEach((s, i) => {
    const no = i + 1;
    if (!s.id) throw new Error('Soal #' + no + ': field "id" wajib diisi');
    if (seenIds.has(s.id)) throw new Error('Soal #' + no + ': id "' + s.id + '" duplikat');
    seenIds.add(s.id);
    const tipe = (s.tipe || '').toLowerCase();
    if (!['pg','mcma','bs'].includes(tipe)) {
      throw new Error('Soal #' + no + ': tipe harus pg/mcma/bs');
    }
    if (!s.q || !s.q.trim()) throw new Error('Soal #' + no + ': field "q" (pertanyaan) wajib diisi');

    if (tipe === 'pg' || tipe === 'mcma') {
      if (!Array.isArray(s.options) || s.options.length < 2 || s.options.length > 4) {
        throw new Error('Soal #' + no + ': options harus 2-4 item');
      }
      if (tipe === 'pg') {
        if (!Number.isInteger(s.key) || s.key < 0 || s.key >= s.options.length) {
          throw new Error('Soal #' + no + ': key PG harus integer 0-' + (s.options.length-1));
        }
      } else {
        if (!Array.isArray(s.key) || s.key.length < 2) {
          throw new Error('Soal #' + no + ': key MCMA harus array minimal 2 item');
        }
        s.key.forEach(k => {
          if (!Number.isInteger(k) || k < 0 || k >= s.options.length) {
            throw new Error('Soal #' + no + ': ada key MCMA di luar jangkauan opsi');
          }
        });
      }
    } else if (tipe === 'bs') {
      if (!Array.isArray(s.pernyataan) || s.pernyataan.length < 2 || s.pernyataan.length > 5) {
        throw new Error('Soal #' + no + ': pernyataan harus 2-5 item');
      }
      s.pernyataan.forEach((p, j) => {
        if (!p.teks || !p.teks.trim()) {
          throw new Error('Soal #' + no + ': pernyataan #' + (j+1) + ' kosong');
        }
        if (typeof p.key !== 'boolean') {
          throw new Error('Soal #' + no + ': key pernyataan #' + (j+1) + ' harus true/false');
        }
      });
    }
  });

  return true;
}

// ============================================================
// ENDPOINT IMPORT JSON DARI TKA STUDIO
// ============================================================
app.post('/api/teacher/import-json', (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'Hanya guru' });
  const { json } = req.body;
  if (!json || typeof json !== 'string') {
    return res.status(400).json({ error: 'Field "json" kosong atau bukan string' });
  }
  let paket;
  try {
    paket = JSON.parse(json);
  } catch (e) {
    return res.status(400).json({ error: 'JSON tidak valid: ' + e.message });
  }
  try {
    validasiPaketJSON(paket);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  if (PAKET[paket.id]) {
    return res.status(409).json({ error: 'Paket "' + paket.id + '" sudah ada. Ganti id atau hapus paket lama.' });
  }
  const finalPaket = {
    version: '1.0',
    id: paket.id,
    judul: paket.judul.trim(),
    mapel: paket.mapel.trim(),
    durasiMenit: paket.durasiMenit,
    acakMode: paket.acakMode || 'per-tipe',
    latihanMandiri: paket.latihanMandiri === true,
    soal: paket.soal.map(s => {
      const item = { id: s.id, tipe: s.tipe.toLowerCase(), q: s.q.trim() };
      if (s.img) item.img = s.img;
      if (s.options) item.options = s.options.map(o => String(o));
      if (s.optionImgs) item.optionImgs = s.optionImgs;
      if (s.tipe.toLowerCase() === 'pg' || s.tipe.toLowerCase() === 'mcma') item.key = s.key;
      if (s.pernyataan) item.pernyataan = s.pernyataan;
      if (s.pembahasan) item.pembahasan = s.pembahasan;
      return item;
    })
  };
  const filePath = path.join(PAKET_DIR, finalPaket.id + '.json');
  fs.writeFileSync(filePath, JSON.stringify(finalPaket, null, 2), 'utf8');
  PAKET = loadPaket();
  res.json({ ok: true, paketId: finalPaket.id, jumlahSoal: finalPaket.soal.length });
});

// Route redirect ke TKA Studio
app.get('/studio', (req, res) => {
  res.redirect(301, 'https://onelabszz.github.io/tka-studio');
});

// ============================================================
// ENDPOINT SISWA
// ============================================================

// ============================================================
app.post('/api/student/join', (req, res) => {
  const { token, nama, kelas } = req.body;
  if (!nama || !token) return res.status(400).json({ error: 'Nama dan token wajib' });

  const sesi = ensureDeadline();
  if (!sesi || sesi.token !== String(token).toUpperCase()) {
    return res.status(403).json({ error: 'Token salah / ujian belum aktif' });
  }

  const wajib = getSetting('wajib_siswa_terdaftar', '0') === '1';
  if (wajib) {
    const found = db.prepare("SELECT * FROM siswa WHERE LOWER(TRIM(nama)) = LOWER(TRIM(?))").get(nama);
    if (!found) {
      return res.status(403).json({ error: 'Nama tidak terdaftar. Hubungi guru untuk mendaftarkan nama Anda.' });
    }
    if (found.aktif === 0) {
      return res.status(403).json({ error: 'Akun Anda dinonaktifkan dari ujian ini. Hubungi pengawas.' });
    }
  }

  const paket = PAKET[sesi.paket_id];
  if (!paket) return res.status(500).json({ error: 'Paket soal hilang' });

  const layout = buildLayout(paket);
  const siswaId = crypto.randomUUID();
  db.prepare(`INSERT INTO siswa_sesi (id, sesi_id, nama, kelas, mulai_at, layout) VALUES (?,?,?,?,?,?)`)
    .run(siswaId, sesi.id, nama, kelas || '', Date.now(), JSON.stringify(layout));

  const soalMap = Object.fromEntries(paket.soal.map(s => [s.id, s]));
  const questions = layout.map(l => {
    const s = soalMap[l.soal_id];
    const tipe = l.tipe || getTipe(s);
    const q = { id: s.id, q: s.q, tipe };
    if (s.img) { const r = resolveGambar(s.img); if (r) q.img = r; }
    if (tipe === 'pg' || tipe === 'mcma') {
      q.options = l.optionsOrder.map(k => s.options[k]);
      if (s.optionImgs) q.optionImgs = l.optionsOrder.map(k => { const raw = s.optionImgs[k]; return raw ? (resolveGambar(raw) || raw) : null; });
    } else if (tipe === 'bs') {
      q.pernyataan = l.pernyataanOrder.map(origIdx => s.pernyataan[origIdx].teks);
    }
    return q;
  });

  res.json({
    siswaId, nama, kelas,
    deadline: sesi.mulai_at + sesi.durasi_menit * 60000,
    serverNow: Date.now(),
    durasiMenit: sesi.durasi_menit,
    totalSoal: questions.length,
    questions,
    ragu: {},
  });
});

app.post('/api/student/state', (req, res) => {
  const { siswaId } = req.body;
  if (!siswaId) return res.status(400).json({ error: 'siswaId kosong' });
  const ss = db.prepare("SELECT * FROM siswa_sesi WHERE id=?").get(siswaId);
  if (!ss) return res.status(404).json({ error: 'Sesi siswa tidak ditemukan' });
  const sesi = db.prepare("SELECT * FROM sesi WHERE id=?").get(ss.sesi_id);
  if (!sesi) return res.status(404).json({ error: 'Sesi hilang' });
  const paket = PAKET[sesi.paket_id];
  if (!paket) return res.status(500).json({ error: 'Paket hilang' });
  const layout = JSON.parse(ss.layout);
  const soalMap = Object.fromEntries(paket.soal.map(s => [s.id, s]));
  const questions = layout.map(l => {
    const s = soalMap[l.soal_id];
    const tipe = l.tipe || getTipe(s);
    const q = { id: s.id, q: s.q, tipe };
    if (s.img) { const r = resolveGambar(s.img); if (r) q.img = r; }
    if (tipe === 'pg' || tipe === 'mcma') {
      q.options = l.optionsOrder.map(k => s.options[k]);
      if (s.optionImgs) q.optionImgs = l.optionsOrder.map(k => { const raw = s.optionImgs[k]; return raw ? (resolveGambar(raw) || raw) : null; });
    } else if (tipe === 'bs') {
      q.pernyataan = l.pernyataanOrder.map(origIdx => s.pernyataan[origIdx].teks);
    }
    const saved = getJawabanSiswa(siswaId, l.soal_id);
    if (saved != null) q.saved = saved;
    return q;
  });
  let raguData = {};
  try { raguData = JSON.parse(ss.ragu_json || '{}'); } catch {}
  res.json({
    siswaId, nama: ss.nama, kelas: ss.kelas,
    sudahSubmit: ss.submit_at != null,
    skor: ss.skor, total: ss.total,
    deadline: sesi.mulai_at + sesi.durasi_menit * 60000,
    serverNow: Date.now(), durasiMenit: sesi.durasi_menit,
    totalSoal: questions.length, questions,
    ragu: raguData,
  });
});

app.post('/api/student/answer', (req, res) => {
  const { siswaId, soalId, jawaban } = req.body;
  const sesi = ensureDeadline();
  if (!sesi) return res.status(410).json({ error: 'Waktu ujian habis' });
  const s = db.prepare("SELECT * FROM siswa_sesi WHERE id=?").get(siswaId);
  if (!s) return res.status(403).json({ error: 'Sesi tidak valid' });
  if (s.submit_at) return res.status(409).json({ error: 'Sudah submit' });
  const layout = JSON.parse(s.layout);
  const l = layout.find(x => x.soal_id === soalId);
  if (!l) return res.status(400).json({ error: 'Soal tidak dikenal' });
  const tipe = l.tipe || 'pg';
  if (tipe === 'pg') { if (!Number.isInteger(jawaban) || jawaban < 0) return res.status(400).json({ error: 'Jawaban tidak valid' }); }
  else if (tipe === 'mcma') { if (!Array.isArray(jawaban) || !jawaban.every(x => Number.isInteger(x) && x >= 0)) return res.status(400).json({ error: 'Jawaban tidak valid' }); }
  else if (tipe === 'bs') { if (!Array.isArray(jawaban) || !jawaban.every(x => x === null || typeof x === 'boolean')) return res.status(400).json({ error: 'Jawaban tidak valid' }); }
  else return res.status(400).json({ error: 'Tipe tidak dikenal' });
  setJawabanSiswa(siswaId, soalId, jawaban);
  res.json({ ok: true });
});

app.post('/api/student/event', (req, res) => {
  const { siswaId, tipe } = req.body;
  if (!siswaId || !tipe) return res.status(400).json({ error: 'Data kurang' });
  if (!['tab_blur', 'copy', 'paste'].includes(tipe)) return res.status(400).json({ error: 'Tipe tidak dikenal' });
  db.prepare("INSERT INTO event_log (siswa_sesi_id, tipe, at) VALUES (?,?,?)").run(siswaId, tipe, Date.now());
  res.json({ ok: true });
});

app.post('/api/student/submit', (req, res) => {
  const { siswaId } = req.body;
  const s = db.prepare("SELECT * FROM siswa_sesi WHERE id=?").get(siswaId);
  if (!s) return res.status(403).json({ error: 'Sesi tidak valid' });
  if (s.submit_at) return res.json({ skor: s.skor, total: s.total, sudah: true });
  const sesi = db.prepare("SELECT * FROM sesi WHERE id=?").get(s.sesi_id);
  const late = sesi && Date.now() > sesi.mulai_at + sesi.durasi_menit * 60000;
  finalizeStudent(siswaId, false);
  const updated = db.prepare("SELECT skor, total FROM siswa_sesi WHERE id=?").get(siswaId);
  res.json({ skor: updated.skor, total: updated.total, late });
});

app.post('/api/student/review', (req, res) => {
  const { siswaId } = req.body;
  if (!siswaId) return res.status(400).json({ error: 'siswaId kosong' });
  const r = buildReview(siswaId, false);
  if (r.error) return res.status(r.code).json({ error: r.error });
  res.json(r);
});

// ============================================================
// Start
// ============================================================
app.listen(PORT, '0.0.0.0', () => {
  console.log('\n============================================');
  console.log('  TKA Local Host v11 siap');
  console.log('============================================');
  console.log(`  Dashboard Guru : http://localhost:${PORT}/guru`);
  console.log(`  Halaman Siswa  : http://${SERVER_IP}:${PORT}`);
  console.log(`  Paket terdaftar: ${Object.keys(PAKET).length}`);
  console.log('============================================');
  console.log('  Scan QR ini dari HP siswa:');
  qrcode.generate(`http://${SERVER_IP}:${PORT}`, { small: true });
  console.log('============================================\n');
  if (process.env.NO_OPEN !== '1') openBrowser(`http://localhost:${PORT}/guru`);
});

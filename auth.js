// auth.js — Level 3: login Supabase, verifikasi profil, simpan session lokal
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createClient } = require('@supabase/supabase-js');

const cfg = require('./config.json');

// Client "anon" untuk auth (signIn, refresh)
const supabase = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

// Client per-panggilan dengan token user di header → RLS auth.uid() terisi
function userClient(accessToken) {
  return createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: 'Bearer ' + accessToken } }
  });
}

const SESSION_FILE = path.join(os.homedir(), '.tka-local', 'session.json');
const REFRESH_THRESHOLD_MS = 5 * 60 * 1000;

function ensureDir() {
  const dir = path.dirname(SESSION_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}
function saveSession(obj) {
  ensureDir();
  fs.writeFileSync(SESSION_FILE, JSON.stringify(obj, null, 2), { mode: 0o600 });
}
function loadSession() {
  try {
    if (!fs.existsSync(SESSION_FILE)) return null;
    return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
  } catch (e) { return null; }
}
function clearSession() {
  try { if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE); } catch (e) {}
}

async function login(email, password) {
  const { data: authData, error: authErr } =
    await supabase.auth.signInWithPassword({ email, password });
  if (authErr) return { ok: false, error: authErr.message };

  const prof = await fetchProfile(authData.session.access_token, authData.user.id);
  if (!prof.ok) {
    try { await supabase.auth.signOut(); } catch (e) {}
    return { ok: false, error: prof.error };
  }

  const sess = {
    access_token: authData.session.access_token,
    refresh_token: authData.session.refresh_token,
    expires_at: authData.session.expires_at,
    user_id: authData.user.id,
    email: authData.user.email,
    school_name: prof.profile.school_name,
    saved_at: Date.now()
  };
  saveSession(sess);
  return { ok: true, session: sess };
}

async function fetchProfile(accessToken, userId) {
  // PENTING: pakai userClient dengan Authorization header agar RLS auth.uid() terisi
  const sb = userClient(accessToken);
  const { data, error } = await sb
    .from('local_profiles')
    .select('school_name, status, expires_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) return { ok: false, error: 'Gagal memuat profil: ' + error.message };
  if (!data) return { ok: false, error: 'Akun ini tidak terdaftar untuk TKA Local Host. Hubungi admin.' };
  if (data.status !== 'active') return { ok: false, error: 'Akun dinonaktifkan. Hubungi admin.' };
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return { ok: false, error: 'Masa aktif habis. Hubungi admin untuk perpanjang.' };
  }
  return { ok: true, profile: data };
}

async function maybeRefresh(sess) {
  if (!sess) return null;
  const now = Math.floor(Date.now() / 1000);
  if (sess.expires_at && (sess.expires_at - now) * 1000 > REFRESH_THRESHOLD_MS) {
    return sess;
  }
  try {
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: sess.refresh_token
    });
    if (error || !data.session) { clearSession(); return null; }
    sess.access_token = data.session.access_token;
    sess.refresh_token = data.session.refresh_token;
    sess.expires_at = data.session.expires_at;
    sess.saved_at = Date.now();
    saveSession(sess);
    return sess;
  } catch (e) {
    return sess;
  }
}

async function check() {
  const sess = loadSession();
  if (!sess) return { ok: false, reason: 'no_session' };

  if (await isOnline()) {
    const refreshed = await maybeRefresh(sess);
    if (!refreshed) return { ok: false, reason: 'refresh_failed' };
    const prof = await fetchProfile(refreshed.access_token, refreshed.user_id);
    if (!prof.ok) {
      clearSession();
      return { ok: false, reason: 'revoked', error: prof.error };
    }
    return { ok: true, session: refreshed, profile: prof.profile };
  }

  return { ok: true, session: sess, profile: { school_name: sess.school_name }, offline: true };
}

async function isOnline() {
  try {
    const r = await fetch(cfg.supabaseUrl + '/auth/v1/health', {
      headers: { apikey: cfg.supabaseAnonKey },
      signal: AbortSignal.timeout(3000)
    });
    return r.ok || r.status < 500;
  } catch (e) { return false; }
}

async function logout() {
  // Cukup hapus session lokal. Token server-side akan expire sendiri.
  clearSession();
  return { ok: true };
}

function getSession() { return loadSession(); }

module.exports = { login, check, logout, getSession };

// admin.js — shared module
const SUPABASE_URL = 'https://zrzbitqfrvtgmxeqnyhi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpyemJpdHFmcnZ0Z214ZXFueWhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2NDA1ODUsImV4cCI6MjEwODIxNjU4NX0.xGZesUy6jrkcXGGg3N-uYgqNjRl7jtHEbqoBQN1IEpQ';

let _client = null;

export async function getClient() {
  if (_client) return _client;
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'tka-admin-auth' }
  });
  return _client;
}

export async function requireAdmin() {
  const sb = await getClient();
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  const { data: profile } = await sb.from('local_profiles')
    .select('role, status, school_name, email').eq('id', session.user.id).maybeSingle();
  if (!profile || !['admin', 'superadmin'].includes(profile.role) || profile.status !== 'active') return null;
  return { user: session.user, profile };
}

export async function requireSuperadmin() {
  const a = await requireAdmin();
  if (!a) return null;
  if (a.profile.role !== 'superadmin') return null;
  return a;
}

export async function logout() {
  const sb = await getClient();
  try { await sb.auth.signOut(); } catch(e) {}
  window.location.href = './index.html';
}

export async function listProfiles() {
  const sb = await getClient();
  const { data, error } = await sb.from('local_profiles')
    .select('id, email, school_name, status, role, expires_at, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function updateProfile(id, updates) {
  const sb = await getClient();
  const { error } = await sb.from('local_profiles').update(updates).eq('id', id);
  if (error) throw error;
}

export async function deleteProfile(id) {
  const sb = await getClient();
  const { error } = await sb.from('local_profiles').delete().eq('id', id);
  if (error) throw error;
}

async function getAccessToken() {
  const sb = await getClient();
  const { data: { session } } = await sb.auth.getSession();
  if (!session) throw new Error('No session');
  return session.access_token;
}

export async function bulkCreate(rows) {
  const token = await getAccessToken();
  const r = await fetch(SUPABASE_URL + '/functions/v1/admin-bulk-create', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Bulk create gagal');
  return d;
}

export async function resetPassword(userId, newPassword) {
  const token = await getAccessToken();
  const r = await fetch(SUPABASE_URL + '/functions/v1/admin-reset-password', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, newPassword })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Reset password gagal');
  return d;
}

export async function deleteUser(userId) {
  const token = await getAccessToken();
  const r = await fetch(SUPABASE_URL + '/functions/v1/admin-delete-user', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Delete user gagal');
  return d;
}

export function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const parseLine = (line) => {
    const out = []; let cur = ''; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"' && line[i+1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQ = false;
        else cur += c;
      } else {
        if (c === ',') { out.push(cur); cur = ''; }
        else if (c === '"') inQ = true;
        else cur += c;
      }
    }
    out.push(cur);
    return out;
  };
  const headers = parseLine(lines[0]).map(h => h.trim().toLowerCase());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = parseLine(lines[i]);
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = (vals[idx] || '').trim(); });
    rows.push(obj);
  }
  return rows;
}

export function fmtDate(iso) {
  if (!iso) return '-';
  try { return new Date(iso).toLocaleDateString('id-ID', { year:'numeric', month:'short', day:'numeric' }); }
  catch(e) { return iso; }
}

export function isExpired(iso) {
  return !!(iso && new Date(iso) < new Date());
}

export function addOneYear() {
  return new Date(Date.now() + 365*24*3600*1000).toISOString();
}

export function randomPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let p = '';
  for (let i = 0; i < 10; i++) p += chars[Math.floor(Math.random() * chars.length)];
  return p;
}

// ============ Toast Notification ============
const ICON_SUCCESS = '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>';
const ICON_ERROR = '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" d="M15 9l-6 6M9 9l6 6"/></svg>';
const ICON_WARNING = '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>';

export function toast(title, msg = '', type = 'info') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  const icon = type === 'success' ? ICON_SUCCESS : type === 'error' ? ICON_ERROR : ICON_WARNING;
  el.innerHTML = `
    <div class="toast-icon">${icon}</div>
    <div class="toast-body">
      <div class="toast-title">${escapeHtml(title)}</div>
      ${msg ? `<div class="toast-msg">${escapeHtml(msg)}</div>` : ''}
    </div>
  `;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity .2s';
    setTimeout(() => el.remove(), 200);
  }, 4000);
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

// ============ Confirm Modal ============
export function confirmModal({ title, message, confirmText = 'Ya', danger = false }) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:420px">
        <div class="modal-header">
          <div class="modal-title">${escapeHtml(title)}</div>
        </div>
        <div class="modal-body">
          <p style="font-size:14px;color:#374151;line-height:1.6">${escapeHtml(message)}</p>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-cancel>Batal</button>
          <button class="btn-primary" data-confirm style="${danger ? 'background:#b91c1c' : ''}">${escapeHtml(confirmText)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = (val) => { overlay.remove(); resolve(val); };
    overlay.querySelector('[data-cancel]').addEventListener('click', () => close(false));
    overlay.querySelector('[data-confirm]').addEventListener('click', () => close(true));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
    const esc = (e) => { if (e.key === 'Escape') { document.removeEventListener('keydown', esc); close(false); } };
    document.addEventListener('keydown', esc);
  });
}

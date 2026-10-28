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

function swalInfo(text, title) { return Swal.fire({ icon: 'info', title: title || 'Info', text: text }); }
function swalError(text, title) { return Swal.fire({ icon: 'error', title: title || 'Gagal', text: text }); }
function swalSuccess(text, title) { return Swal.fire({ icon: 'success', title: title || 'Berhasil', text: text }); }
async function swalConfirm(text, title) {
  const r = await Swal.fire({ icon: 'warning', title: title || 'Konfirmasi', text: text, showCancelButton: true, confirmButtonText: 'Ya, lanjutkan', cancelButtonText: 'Batal', confirmButtonColor: '#1e40af', cancelButtonColor: '#64748b' });
  return r.isConfirmed;
}
async function swalPrompt(title, defaultValue) {
  const r = await Swal.fire({ title: title, input: 'text', inputValue: defaultValue || '', showCancelButton: true, confirmButtonText: 'OK', cancelButtonText: 'Batal', confirmButtonColor: '#1e40af', cancelButtonColor: '#64748b' });
  return r.isConfirmed ? r.value : null;
}
function swalLoading(text) {
  return Swal.fire({ title: text || 'Memuat...', allowOutsideClick: false, allowEscapeKey: false, didOpen: () => Swal.showLoading() });
}
function slugify(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 60);
}
function escapeHtml(s) {
  var d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

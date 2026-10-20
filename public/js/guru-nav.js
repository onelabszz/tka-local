function navigate(sectionId) {
  document.querySelectorAll('.section').forEach(function(s) { s.classList.remove('active'); });
  document.getElementById('section-' + sectionId).classList.add('active');
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(function(n) {
    n.classList.toggle('active', n.dataset.section === sectionId);
  });
  if (window.innerWidth < 768) closeSidebar();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarBackdrop').classList.toggle('show');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarBackdrop').classList.remove('show');
}
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') closeSidebar();
});

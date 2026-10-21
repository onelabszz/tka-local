const CACHE_NAME = 'tka-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/css/siswa.css',
  '/js/siswa-app.js',
  '/sweetalert2.min.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => 
    Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Jangan cache request ke API (jawaban, login, dll)
  if (e.request.url.includes('/api/') || e.request.url.includes('/gambar/')) return;
  
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});

// PWA 缓存 v2：同源资源网络优先（保证更新及时），行情/净值请求直连不缓存
const CACHE = 'xiaocaiben-v4';
const ASSETS = [
  './', 'index.html', 'css/app.css', 'manifest.json',
  'js/utils.js', 'js/storage.js', 'js/market.js', 'js/fund.js', 'js/advice.js', 'js/app.js',
  'vendor/echarts.min.js'
];
const DATA_HOSTS = ['eastmoney.com', 'gtimg.cn'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || DATA_HOSTS.some(h => u.hostname.includes(h))) return;
  // 同源：网络优先，失败再回缓存
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) { const cl = res.clone(); caches.open(CACHE).then(c => c.put(e.request, cl)); }
      return res;
    }).catch(() => caches.match(e.request))
  );
});

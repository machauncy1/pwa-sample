// Service Worker —— v2：离线缓存 + 离线 fallback + 推送 + 后台同步
const CACHE = 'pwa-sample-v3';
const OFFLINE_URL = 'offline.html';
const ASSETS = [
  './',
  './index.html',
  './offline.html',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// ---- install：预缓存。注意不再 skipWaiting，保留 waiting 状态供更新提示用 ----
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

// ---- activate：清旧缓存 ----
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// ---- 收到页面的 SKIP_WAITING 消息 → 立即激活新版本 ----
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// ---- fetch：cache-first；导航请求 miss 时回退到离线页 ----
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).catch(() => {
        // 网络也失败：导航请求 → 离线 fallback 页
        if (req.mode === 'navigate') return caches.match(OFFLINE_URL);
        return new Response('', { status: 504, statusText: 'offline' });
      });
    })
  );
});

// ---- push：收到推送服务的消息，弹系统通知 ----
self.addEventListener('push', (e) => {
  let data = { title: 'PWA Sample', body: '收到一条推送' };
  try {
    if (e.data) data = e.data.json();
  } catch (_) {
    if (e.data) data.body = e.data.text();
  }
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      data: { url: './index.html' },
    })
  );
});

// ---- notificationclick：点通知 → 聚焦已开窗口或开新窗 ----
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './index.html';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
      for (const c of cs) {
        if ('focus' in c) return c.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});

// ---- sync：Background Sync，网络恢复时触发 ----
self.addEventListener('sync', (e) => {
  if (e.tag === 'demo-sync') {
    e.waitUntil(
      self.registration.showNotification('Background Sync', {
        body: '网络已恢复，后台同步任务已执行 ✅',
        icon: 'icons/icon-192.png',
      })
    );
  }
});

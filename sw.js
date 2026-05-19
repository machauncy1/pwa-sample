// Service Worker —— 离线缓存 + 离线 fallback + 推送 + 后台同步
const CACHE = 'pwa-sample-v9';
const OFFLINE_URL = 'offline.html';
const ASSETS = [
  './',
  './index.html',
  './push-landing.html',
  './offline.html',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/banner.png',
];

// ---- install：预缓存。注意不再 skipWaiting，保留 waiting 状态供更新提示用 ----
// cache:'reload' 强制绕过 HTTP 缓存，否则会把过期的旧资源存进新 cache
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))
    )
  );
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

  const opts = {
    body: data.body,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    // payload 里的 url 决定点击跳哪个页面，缺省回主页
    data: { url: data.url || './index.html' },
  };
  if (data.image) opts.image = data.image; // 通知大图（Android 展开显示）
  if (data.actions) opts.actions = data.actions; // 通知 action 按钮

  const tasks = [self.registration.showNotification(data.title, opts)];
  // payload 带 badgeCount → 给主屏图标设角标
  if (typeof data.badgeCount === 'number' && self.navigator.setAppBadge) {
    tasks.push(self.navigator.setAppBadge(data.badgeCount).catch(() => {}));
  }
  e.waitUntil(Promise.all(tasks));
});

// ---- notificationclick：点通知/action 按钮 → 清角标 + 跳转 ----
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const dismiss = e.action === 'dismiss'; // 点了「忽略」按钮
  // 解析成绝对 URL，避免相对路径在不同上下文歧义
  const target = new URL(
    (e.notification.data && e.notification.data.url) || './index.html',
    self.location.href
  ).href;
  e.waitUntil(
    (async () => {
      // 用户已响应通知 → 清掉主屏图标角标
      if (self.navigator.clearAppBadge) {
        await self.navigator.clearAppBadge().catch(() => {});
      }
      if (dismiss) return; // 「忽略」：只清角标关通知，不跳转

      const cs = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      // 已有窗口：导航到目标页再聚焦
      for (const c of cs) {
        if ('navigate' in c) {
          const navigated = await c.navigate(target).catch(() => c);
          return (navigated || c).focus();
        }
        return c.focus();
      }
      // 无窗口：直接开目标页
      return self.clients.openWindow(target);
    })()
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

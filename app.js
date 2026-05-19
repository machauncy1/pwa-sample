'use strict';

const $ = (id) => document.getElementById(id);
const log = (msg) => { $('log').textContent = msg; };

// VAPID 公钥：客户端 subscribe 用。配套私钥归服务端，演示项目无服务端故省略。
const VAPID_PUBLIC = 'BO1xiBe4DBQbowzYiRb1NUklYRSubXWaoHR3S79Za0MAMbqTTDj6c5_LVnHboKd0ydNu31RpDlrSIitubcxJD3o';

// ===================================================================
// 1. Service Worker 注册 + 更新检测
// ===================================================================
let swRegistration = null;

function showUpdateBanner(worker) {
  $('update-banner').style.display = 'block';
  $('update-btn').onclick = () => {
    worker.postMessage({ type: 'SKIP_WAITING' }); // 让等待中的新 SW 立即激活
  };
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then((reg) => {
    swRegistration = reg;
    $('sw').textContent = '✅ 已注册';

    // 已有 worker 在 waiting → 立刻提示
    if (reg.waiting && navigator.serviceWorker.controller) showUpdateBanner(reg.waiting);

    // 发现新版本正在安装
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw.addEventListener('statechange', () => {
        // 新 SW 装好 + 已有旧 SW 控制页面 = 这是一次"更新"
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateBanner(nw);
        }
      });
    });
  }).catch((e) => { $('sw').textContent = '❌ ' + e.message; });

  // 新 SW 接管后刷新一次（拿到新资源）
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  });
}

// ===================================================================
// 2. 状态：网络 / 显示模式
// ===================================================================
const updateNet = () => {
  $('net').textContent = navigator.onLine ? '🟢 在线' : '🔴 离线';
};
updateNet();
addEventListener('online', updateNet);
addEventListener('offline', updateNet);

const isStandalone =
  matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
$('mode').textContent = isStandalone ? '📱 standalone (已安装)' : '🌐 browser tab';

// ===================================================================
// 3. 安装：iOS 手动引导 / 其它平台自动 prompt
// ===================================================================
const isIOS =
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

if (isIOS && !isStandalone) {
  $('ios-hint').style.display = 'block';
  $('install').style.display = 'none';
}

let deferredPrompt;
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  $('install').disabled = false;
});
$('install').addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  log('安装结果: ' + outcome);
  deferredPrompt = null;
  $('install').disabled = true;
});

// ===================================================================
// 4. Web Push：通知权限 + 订阅 + 本地测试通知
// ===================================================================
function b64ToUint8(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function refreshPushUI() {
  const ok = 'Notification' in window;
  $('push-perm').textContent = ok ? Notification.permission : '不支持';
}
refreshPushUI();

$('push-enable').addEventListener('click', async () => {
  if (!('Notification' in window)) return log('此浏览器不支持 Notification');
  const perm = await Notification.requestPermission();
  refreshPushUI();
  if (perm !== 'granted') return log('通知权限被拒绝');

  // 订阅推送服务，拿到 subscription（真实场景发给服务端存起来）
  try {
    let sub = await swRegistration.pushManager.getSubscription();
    if (!sub) {
      sub = await swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64ToUint8(VAPID_PUBLIC),
      });
    }
    $('push-sub').textContent = JSON.stringify(sub.toJSON(), null, 2);
    log('已订阅推送。真实推送需服务端用 VAPID 私钥向 endpoint 发消息');
  } catch (e) {
    log('订阅失败: ' + e.message);
  }
});

// 本地通知：不经推送服务，直接由 SW 弹，验证通知 UI + notificationclick
$('push-test').addEventListener('click', async () => {
  if (Notification.permission !== 'granted') return log('请先启用通知');
  await swRegistration.showNotification('PWA Sample', {
    body: '这是一条本地测试通知，点它会聚焦回 app',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: { url: location.href },
  });
  log('通知已发出');
});

// ===================================================================
// 5. Web Share：调系统分享面板
// ===================================================================
if (!navigator.share) {
  $('share').disabled = true;
  $('share').textContent = '此浏览器不支持 Web Share';
}
$('share').addEventListener('click', async () => {
  try {
    await navigator.share({
      title: 'PWA Sample',
      text: '看看这个 PWA 示例',
      url: location.href,
    });
    log('分享完成');
  } catch (e) {
    log('分享取消/失败: ' + e.message);
  }
});

// ===================================================================
// 6. App Badge：图标角标
// ===================================================================
let badgeCount = 0;
const badgeSupported = 'setAppBadge' in navigator;
if (!badgeSupported) {
  $('badge-add').disabled = true;
  $('badge-clear').disabled = true;
  $('badge-count').textContent = '不支持';
}
$('badge-add').addEventListener('click', () => {
  badgeCount++;
  navigator.setAppBadge(badgeCount);
  $('badge-count').textContent = badgeCount;
});
$('badge-clear').addEventListener('click', () => {
  badgeCount = 0;
  navigator.clearAppBadge();
  $('badge-count').textContent = 0;
});

// ===================================================================
// 7. IndexedDB：本地结构化存储
// ===================================================================
function openDB() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('pwa-sample-db', 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('notes', { keyPath: 'id', autoIncrement: true });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function dbAdd(text) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('notes', 'readwrite');
    tx.objectStore('notes').add({ text, at: Date.now() });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function dbAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction('notes').objectStore('notes').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function renderNotes() {
  const notes = await dbAll();
  $('note-list').innerHTML =
    notes.length === 0
      ? '<li style="opacity:.5">还没有笔记</li>'
      : notes
          .map((n) => `<li>${n.text} <small>${new Date(n.at).toLocaleTimeString()}</small></li>`)
          .join('');
}

$('note-add').addEventListener('click', async () => {
  const v = $('note-input').value.trim();
  if (!v) return;
  await dbAdd(v);
  $('note-input').value = '';
  renderNotes();
  log('已存入 IndexedDB，刷新/离线后仍在');
});
renderNotes();

// ===================================================================
// 8. 持久化存储：防止系统在空间紧张时清掉缓存
// ===================================================================
async function refreshStorage() {
  if (!navigator.storage) return ($('storage').textContent = '不支持');
  const persisted = await navigator.storage.persisted();
  const est = await navigator.storage.estimate();
  const kb = (n) => (n / 1024).toFixed(0) + ' KB';
  $('storage').textContent =
    `persisted=${persisted} · 用量 ${kb(est.usage || 0)}/${kb(est.quota || 0)}`;
}
$('persist').addEventListener('click', async () => {
  if (!navigator.storage || !navigator.storage.persist)
    return log('此浏览器不支持 persist()');
  const ok = await navigator.storage.persist();
  log(ok ? '已转为持久化存储' : '浏览器拒绝（通常装成 PWA 后才批准）');
  refreshStorage();
});
refreshStorage();

// ===================================================================
// 9. Background Sync：离线排队，网络恢复自动执行
// ===================================================================
$('sync').addEventListener('click', async () => {
  if (!('SyncManager' in window)) return log('此浏览器不支持 Background Sync');
  try {
    await swRegistration.sync.register('demo-sync');
    log('已注册同步任务。断网→重连后 SW 会触发并弹通知');
  } catch (e) {
    log('注册失败: ' + e.message);
  }
});
if (!('SyncManager' in window)) {
  $('sync').textContent = '此浏览器不支持 Background Sync';
}

// ===================================================================
// 10. App Shortcuts：处理长按图标快捷方式带来的 ?action=
// ===================================================================
const action = new URLSearchParams(location.search).get('action');
if (action === 'new-note') {
  $('note-input').focus();
  $('note-input').scrollIntoView({ behavior: 'smooth' });
} else if (action === 'notify') {
  $('push-test').click();
}

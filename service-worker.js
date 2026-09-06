/**
 * EuriskoTax Service Worker
 * 策略：
 *   - 应用壳（HTML/JS/图标/manifest）预缓存，保证离线打开
 *   - 同源静态资源：stale-while-revalidate（先回缓存，后台更新）
 *   - CDN 第三方资源：cache-first（命中即返回，未命中走网络并缓存）
 *   - API 请求（/api/*）：network-only（不缓存，数据需实时且需认证）
 *   - HTML 导航请求：network-first，离线时回退到缓存的 index.html
 *
 * 升级方式：修改 CACHE_VERSION 即可触发浏览器重新安装并清理旧缓存
 */
const CACHE_VERSION = 'euriskotax-v4';
const APP_SHELL_CACHE = CACHE_VERSION + '-shell';
const RUNTIME_CACHE = CACHE_VERSION + '-runtime';
const CDN_CACHE = CACHE_VERSION + '-cdn';

// 应用壳：首次安装时预缓存，确保离线可启动
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/images/logo.png',
  '/images/icon-192.png',
  '/images/icon-512.png',
  '/src/js/data/data-management.js',
  '/src/js/data/field-hints.js',
  '/src/js/data/tax-assistant.js',
  '/src/js/calculation/tax-calculator.js',
  '/src/js/calculation/helper-functions.js',
  '/src/js/calculation/utils.js',
  '/src/js/ui/navigation-ui.js',
  '/src/js/ui/home-ui.js',
  '/src/js/ui/tax-assistant-ui.js',
  '/src/js/export/export-utils.js',
  '/src/js/utils/mock-client.js',
  '/src/js/app.js'
];

// 核心 CDN 资源预缓存（离线兜底）：
// Tailwind（样式）+ Font Awesome（图标）是页面渲染必需，离线时必须可用
// Chart.js/jsPDF/html2canvas 仅在导出图表/PDF 时使用，不预缓存（运行时按需缓存）
const CDN_SHELL = [
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/font-awesome@4.7.0/css/font-awesome.min.css'
];

// CDN 域名白名单：命中后走 cache-first 策略
const CDN_HOSTS = [
  'cdn.tailwindcss.com',
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com'
];

// 逐个缓存资源，单个失败不阻塞整体（CDN 可能因 CORS/网络波动失败）
function cacheAll(cache, urls) {
  return Promise.all(urls.map((url) =>
    cache.add(url).catch((err) => console.warn('[SW] 预缓存跳过:', url, err))
  ));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE)
      .then((cache) => cacheAll(cache, APP_SHELL))
      .then(() => caches.open(CDN_CACHE))
      .then((cache) => cacheAll(cache, CDN_SHELL))
      .then(() => self.skipWaiting())
      .catch((err) => {
        console.error('[SW] 预缓存阶段出错:', err);
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => !key.startsWith(CACHE_VERSION))
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 只处理 GET 请求
  if (request.method !== 'GET') return;

  // 1. API 请求：不缓存，始终走网络（数据实时 + 需认证）
  if (url.pathname.startsWith('/api/')) {
    return; // 不做响应拦截，交给网络
  }

  // 2. HTML 导航请求：network-first，离线回退缓存
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(APP_SHELL_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // 3. CDN 第三方资源：cache-first（命中直接返回，未命中走网络并缓存）
  if (CDN_HOSTS.includes(url.host)) {
    event.respondWith(
      caches.match(request)
        .then((cached) => {
          if (cached) return cached;
          return fetch(request)
            .then((response) => {
              if (response && response.status === 200) {
                const copy = response.clone();
                caches.open(CDN_CACHE).then((cache) => cache.put(request, copy));
              }
              return response;
            })
            .catch(() => cached); // 网络失败且无缓存时返回 undefined
        })
    );
    return;
  }

  // 4. 同源 JS/CSS 资源：network-first（确保代码更新即时生效，不返回旧缓存）
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.mjs') || url.pathname.endsWith('.css')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || Response.error()))
    );
    return;
  }

  // 5. 其他同源静态资源（图片/字体等）：stale-while-revalidate
  event.respondWith(
    caches.match(request)
      .then((cached) => {
        const networkFetch = fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              const copy = response.clone();
              caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => cached);
        return cached || networkFetch;
      })
  );
});

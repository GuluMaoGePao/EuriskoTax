/**
 * EuriskoTax Service Worker —— 「瘦缓存」网络优先策略（2026-09-06）
 *
 * 背景：旧版在 install 阶段预缓存整个应用壳（含 index.html + 全部自有 JS），
 * 使 SW 成为「某次发布的内容快照」：每次发版都要升 CACHE_VERSION，老用户
 * 还得手动清缓存才能看到新版 —— 线上因此反复出现「旧 HTML/旧脚本残留」
 * （如登录页协议弹不出、报错行号超出源码实际行数）。改造目标：根治该问题，
 * 同时保住「离线也能算」的免费版卖点。
 *
 * 新策略（与服务器 ETag 协商缓存配套，自有 JS 不再带 ?v= 指纹）：
 *   - 不做任何预缓存 → SW 不再锁定内容版本，代码更新即见即所得
 *   - HTML 导航：network-first，成功即缓存最新页面；仅真正断网时回退缓存
 *   - 同源 JS/CSS/图片：network-first，成功后覆写运行缓存（弱网/离线可回退）
 *   - CDN 第三方资源：cache-first（离线必需：Tailwind / Font Awesome）
 *   - API（/api/*）：永不缓存、永不拦截
 *
 * 结果：在线永远最新；访问过的资源断网后仍可用（离线计税保留）；
 * 老用户无需手动清缓存，新 SW 激活时自动清理全部历史缓存。
 *
 * 维护提示：正常发版无需改动本文件版本号；仅当缓存策略本身变更时才需改名缓存键。
 */
const RUNTIME_CACHE = 'euriskotax-runtime-v1';
const CDN_CACHE = 'euriskotax-cdn-v1';

// CDN 域名白名单：命中后走 cache-first 策略
const CDN_HOSTS = [
  'cdn.tailwindcss.com',
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com'
];

// 安全写入运行缓存：SW 更新接管期间，同一请求可能被并发多次 put（如 HTML 与 JS），
// 浏览器会抛 "Cache has already been updated"，此处静默忽略以避免控制台 Uncaught 报错。
function putResult(cachePromise, request, response) {
  return cachePromise.then((cache) => cache.put(request, response)).catch(() => {});
}

self.addEventListener('install', () => {
  // 无预缓存：在线访问到的资源在 fetch 阶段自动落入运行缓存，安装期不再固定版本快照
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== RUNTIME_CACHE && key !== CDN_CACHE)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 只处理 http/https 请求，其余（chrome-extension://、devtools:// 等）直接放行，
  // 否则 cache.put 会因不支持的 scheme 抛 "Request scheme 'chrome-extension' is not supported"
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // 只处理 GET 请求
  if (request.method !== 'GET') return;

  // 1. API 请求：不缓存、不拦截（数据实时 + 需认证）
  if (url.pathname.startsWith('/api/')) return;

  // 2. CDN 第三方资源：cache-first（命中直接返回，离线必需；未命中走网络并缓存）
  if (CDN_HOSTS.includes(url.host)) {
    event.respondWith(
      caches.match(request)
        .then((cached) => {
          if (cached) return cached;
          return fetch(request)
            .then((response) => {
              if (response && response.status === 200) {
                const copy = response.clone();
                putResult(caches.open(CDN_CACHE), request, copy);
              }
              return response;
            })
            .catch(() => cached); // 网络失败且无缓存时返回 undefined
        })
    );
    return;
  }

  // 3. HTML 导航请求：network-first；成功即缓存最新页面，仅真正断网时回退缓存。
  //    在线绝不返回缓存的旧 HTML —— 这是根治「旧页面/旧脚本残留」的关键。
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            putResult(caches.open(RUNTIME_CACHE), request, copy);
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request, { ignoreSearch: true });
          if (cached) return cached;
          const home = await caches.match('/');
          if (home) return home;
          return caches.match('/index.html');
        })
    );
    return;
  }

  // 4. 同源静态资源（JS/CSS/图片/字体/manifest 等）：network-first，
  //    成功后覆写运行缓存；弱网/离线时回退缓存副本
  //    （ignoreSearch 兼容历史遗留的带 ?v= 指纹请求，命中同文件缓存）
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200) {
          const copy = response.clone();
          putResult(caches.open(RUNTIME_CACHE), request, copy);
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request, { ignoreSearch: true });
        return cached || Response.error();
      })
  );
});

/* Purin Service Worker（P4 PWA）
 * 策略：
 *  - 静态资源（同源 GET）：cache-first + 后台更新，断网也能打开 App 壳
 *  - 页面导航：network-first，拿不到再回退缓存（保证发版后 index.html 是新的）
 *  - /commercial.json、/api/*、/admin/*：永远走网络（商用开关与授权必须实时）
 */
const CACHE = "purin-v3";
const PRECACHE = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/favicon.png",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function isAlwaysNetwork(pathname) {
  return pathname === "/commercial.json" || pathname.startsWith("/api/") || pathname.startsWith("/admin/");
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isAlwaysNetwork(url.pathname)) return; // 直接放行，不接管

  if (request.mode === "navigate") {
    // 页面导航：network-first，回退缓存壳
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put("/", copy));
          return response;
        })
        .catch(() => caches.match("/").then((cached) => cached ?? caches.match("/index.html"))),
    );
    return;
  }

  // 静态资源：cache-first + 后台刷新
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached ?? network;
    }),
  );
});

// サービスワーカー：画面と静的ファイルを保存して、機内モードでも開けるようにする。
// データはブラウザの中の DB（IndexedDB）にあるので、ここでは扱わない。
const VERSION = 'booking-crm-v1'; // 画面の作りを大きく変えたら数字を上げる（古い保存が消える）
const PRECACHE = ['/', '/book/', '/book/time/', '/book/confirm/', '/book/done/', '/my/', '/today/', '/calendar/', '/customers/', '/customers/detail/', '/return/', '/settings/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(PRECACHE).catch(() => {})).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // 名前に中身の印が付く静的ファイル（_next/static）と、画像・アイコンは、保存したものを先に返す
  const immutable = url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/');
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      if (immutable) {
        const hit = await cache.match(req);
        if (hit) return hit;
      }
      // 画面（HTML）やデータは、まず通信して最新を返す。通信できないとき（機内モード）だけ保存したものを返す
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        const hit = await cache.match(req, { ignoreSearch: true });
        if (hit) return hit;
        if (req.mode === 'navigate') return (await cache.match('/')) || Response.error();
        return Response.error();
      }
    }),
  );
});

// 初めて開いたときは、画面を読み込んだあとでサービスワーカーが有効になる。そのとき読み込んだファイルは、画面側から一覧を受け取って保存する（このあと機内モードでも開けるように）
self.addEventListener('message', (e) => {
  const d = e.data;
  if (!d || d.type !== 'cache-urls' || !Array.isArray(d.urls)) return;
  e.waitUntil(
    caches.open(VERSION).then((cache) =>
      Promise.all(
        d.urls
          .filter((u) => typeof u === 'string' && new URL(u, self.location.origin).origin === self.location.origin)
          .map((u) => cache.add(u).catch(() => {})),
      ),
    ),
  );
});

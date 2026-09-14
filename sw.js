// Service worker da Rádios Portugal Live.
// Guarda apenas a interface (para abrir offline). Nunca guarda nem interceta os streams de rádio.
// Ao alterar ícones, logos ou o manifesto, aumente a versão abaixo.
const CACHE = "radiospt-v4";
const ASSETS = [
  "./",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  // cache: "reload" ignora a cache HTTP do browser, para não guardar ficheiros antigos logo após uma publicação.
  const requests = ASSETS.map((url) => new Request(url, { cache: "reload" }));
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(requests)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Streams e tudo o que venha de outros domínios: o browser trata diretamente.
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  // Áudio/vídeo ou pedidos parciais (Range), mesmo no próprio domínio: nunca passam pela cache.
  if (req.destination === "audio" || req.destination === "video" || req.headers.has("range")) return;

  if (req.mode === "navigate") {
    // Página: tenta a rede primeiro (para receber atualizações); sem rede ou com erro do servidor, usa a cópia guardada.
    const isAppPage = url.pathname.endsWith("/") || url.pathname.endsWith("/index.html");
    event.respondWith(
      fetch(req)
        .then((res) => {
          const isHtml = (res.headers.get("content-type") || "").includes("text/html");
          if (res.ok && isAppPage && isHtml) {
            const copy = res.clone();
            event.waitUntil(caches.open(CACHE).then((c) => c.put("./", copy)));
            return res;
          }
          if (!res.ok && isAppPage) return caches.match("./").then((hit) => hit || res);
          return res;
        })
        .catch(() => caches.match("./"))
    );
    return;
  }

  // Ícones, logos e manifesto: cache primeiro; o que vier da rede fica guardado para uso offline.
  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        event.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy)));
      }
      return res;
    }))
  );
});

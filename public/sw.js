// v2 : le cache v1 servait des pages d'un déploiement précédent, dont les
// feuilles de style n'existaient plus, et gardait leurs 404 — la page
// s'affichait sans CSS. Le changer de nom l'efface à l'activation.
const CACHE_NAME = "oracly-pwa-cache-v2";
const PRECACHE_URLS = ["/", "/manifest.webmanifest", "/icons/oracly-icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => {
        /* ignore install errors so the SW still activates */
      })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

/** Garde une copie, seulement d'une réponse réussie : une 404 ne doit jamais être resservie. */
function remember(request, response) {
  if (response.ok) {
    const copy = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  // En développement, les fichiers de build ne changent pas de nom quand
  // leur contenu change : un worker resté enregistré servait du code périmé.
  if (["localhost", "127.0.0.1", "[::1]"].includes(self.location.hostname)) {
    return;
  }

  // Fichiers de build : leur nom change avec leur contenu, le cache ne peut
  // pas les périmer.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => remember(request, response)))
    );
    return;
  }

  // Pages : toujours la version en ligne, qui pointe vers les fichiers du
  // déploiement courant. Le cache ne sert qu'hors ligne.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => remember(request, response))
        .catch(() =>
          caches.match(request).then(
            (cached) =>
              cached ||
              new Response("Mode hors ligne actif.", {
                status: 503,
                statusText: "Service Unavailable",
                headers: { "Content-Type": "text/plain; charset=utf-8" },
              })
          )
        )
    );
  }

  // Le reste (API, données de page, images) passe par le réseau, sans cache.
});

/* Kysmindset guard — intercepts this origin’s network when the PWA is installed. */
const DECOYS = {
  "/decoy/ssh": "Decoy shell",
  "/decoy/admin": "Decoy admin",
  "/decoy/credentials": "Decoy secrets",
  "/decoy/mysql": "Decoy database",
  "/decoy/ftp": "Decoy backup API",
};

let kill = false;
let lockdown = false;
let blocked = new Set();
let armed = new Set(Object.keys(DECOYS));

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  const d = event.data || {};
  if (d.type === "state") {
    kill = Boolean(d.kill);
    lockdown = Boolean(d.lockdown);
    blocked = new Set(d.blocked || []);
    armed = new Set(d.armed || Object.keys(DECOYS));
  }
});

function ping(msg) {
  return self.clients.matchAll({ includeUncontrolled: true, type: "window" }).then((clients) => {
    for (const c of clients) c.postMessage(msg);
  });
}

function fail(reason) {
  return new Response("", {
    status: 503,
    statusText: "Kysmindset " + reason,
    headers: { "Cache-Control": "no-store", "X-Kysmindset": reason },
  });
}

function isCritical(url) {
  if (url.origin === self.location.origin) return true;
  const h = url.hostname;
  if (h === "localhost" || h === "127.0.0.1") return true;
  return false;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  if (armed.has(url.pathname) && DECOYS[url.pathname]) {
    event.respondWith(
      ping({
        type: "honeypot",
        path: url.pathname,
        name: DECOYS[url.pathname],
        method: req.method,
        at: Date.now(),
      }).then(() => fail("honeypot")),
    );
    return;
  }

  if (req.mode === "navigate" && isCritical(url)) return;

  if (blocked.has(url.hostname) || blocked.has(url.host)) {
    event.respondWith(
      ping({ type: "drop", host: url.host, reason: "blocklist", at: Date.now() }).then(() =>
        fail("blocked"),
      ),
    );
    return;
  }

  if ((kill || lockdown) && !isCritical(url)) {
    event.respondWith(
      ping({
        type: "drop",
        host: url.host,
        reason: kill ? "kill" : "lockdown",
        at: Date.now(),
      }).then(() => fail(kill ? "kill-switch" : "lockdown")),
    );
  }
});
